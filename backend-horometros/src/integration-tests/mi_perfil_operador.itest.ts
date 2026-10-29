import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { generarToken } from '../services/jwt.service';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';
import bcrypt from 'bcryptjs';

/*
"Mi Perfil" del trabajador (pedido del usuario, 2026-10-28): GET /asistencia/mi-historial (ver su propio
historial, igual que el que ya ve ADMIN/ASISTENTE pero acotado a si mismo) y PUT /asistencia/mi-usuario
(cambiar SOLO el usuario, nunca la clave).
*/
describe('"Mi Perfil" del trabajador (mi-historial / mi-usuario)', () => {
    let haciendaId: number;
    let supervisorId: number;
    let tokenAdmin: string;
    let operadorId: number;
    let tokenOperador: string;
    let otroOperadorId: number;

    const crearAsistenciaCerrada = (datos: Partial<{ fecha: string; estado: 'FINALIZADO' | 'SALIDA_OLVIDADA' | 'OBSERVANDO'; confirmado_por_supervisor: boolean }>) =>
        Asistencia.create({
            operador_id: operadorId,
            fecha: datos.fecha || '2026-10-20',
            hora_ingreso: new Date(`${datos.fecha || '2026-10-20'}T12:00:00.000Z`),
            hora_salida: new Date(`${datos.fecha || '2026-10-20'}T18:00:00.000Z`),
            estado: datos.estado || 'FINALIZADO',
            confirmado_por_supervisor: datos.confirmado_por_supervisor ?? true,
        });

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Mi Perfil' });
        haciendaId = hacienda.id;

        const admin = await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const loginAdmin = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = loginAdmin.body.token;

        const supervisor = await crearUsuarioDePrueba({ usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaId });
        supervisorId = supervisor.id;

        const operador = await Operador.create({
            nombre_completo: 'E2E Mi Perfil', codigo_megued: 'OP-MIPERFIL', supervisor_id: supervisorId,
            usuario: 'mi_perfil_op', clave_hash: await bcrypt.hash('ClaveOp123456', 10),
            cedula: '1234567890', telefono: '0999111222',
        });
        operadorId = operador.id;
        tokenOperador = generarToken({ id: operador.id, tipo: 'operador', rol: 'MECANICO', hacienda_id: haciendaId });

        const otroOperador = await Operador.create({
            nombre_completo: 'Otro Operador', codigo_megued: 'OP-OTRO', supervisor_id: supervisorId,
            usuario: 'otro_operador',
        });
        otroOperadorId = otroOperador.id;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('GET /api/asistencia/mi-historial', () => {
        it('el operador ve solo sus propios registros ya cerrados y revisados', async () => {
            await crearAsistenciaCerrada({ fecha: '2026-10-20', estado: 'FINALIZADO' });
            await crearAsistenciaCerrada({ fecha: '2026-10-21', estado: 'OBSERVANDO' });
            // Del OTRO operador - no debe aparecer.
            await Asistencia.create({
                operador_id: otroOperadorId, fecha: '2026-10-20', hora_ingreso: new Date('2026-10-20T12:00:00.000Z'),
                estado: 'FINALIZADO', confirmado_por_supervisor: true,
            });

            const res = await request(app)
                .get('/api/asistencia/mi-historial')
                .set('Authorization', `Bearer ${tokenOperador}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.data.every((reg: any) => reg.operador_id === operadorId)).toBe(true);
        });

        it('ignora un operador_id distinto que venga en la query - siempre fuerza el propio', async () => {
            await Asistencia.create({
                operador_id: otroOperadorId, fecha: '2026-10-20', hora_ingreso: new Date('2026-10-20T12:00:00.000Z'),
                estado: 'FINALIZADO', confirmado_por_supervisor: true,
            });

            const res = await request(app)
                .get(`/api/asistencia/mi-historial?operador_id=${otroOperadorId}`)
                .set('Authorization', `Bearer ${tokenOperador}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(0);
        });

        it('un token de cuenta de oficina (ADMIN/ASISTENTE/SUPERVISOR) no puede usar esta ruta', async () => {
            const res = await request(app)
                .get('/api/asistencia/mi-historial')
                .set('Authorization', `Bearer ${tokenAdmin}`);

            expect(res.status).toBe(403);
        });
    });

    describe('PUT /api/asistencia/mi-usuario', () => {
        it('cambia el usuario propio exitosamente', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ usuario: 'mi_perfil_op_nuevo' });

            expect(res.status).toBe(200);
            expect(res.body.usuario).toBe('mi_perfil_op_nuevo');

            const actualizado = await Operador.findByPk(operadorId);
            expect(actualizado?.usuario).toBe('mi_perfil_op_nuevo');
        });

        it('rechaza con 409 si el usuario ya está en uso por OTRO operador', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ usuario: 'otro_operador' });

            expect(res.status).toBe(409);
            const sinCambios = await Operador.findByPk(operadorId);
            expect(sinCambios?.usuario).toBe('mi_perfil_op');
        });

        it('rechaza con 409 si el usuario ya está en uso por una cuenta de oficina', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ usuario: 'admin1' });

            expect(res.status).toBe(409);
        });

        it('mandar "clave" en el body NO cambia clave_hash - esta ruta nunca toca la clave', async () => {
            const antes = await Operador.findByPk(operadorId);
            const hashAntes = antes?.clave_hash;

            const res = await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ usuario: 'mi_perfil_op_nuevo', clave: 'IntentoDeCambiarClave123' });

            expect(res.status).toBe(200);
            const despues = await Operador.findByPk(operadorId);
            expect(despues?.clave_hash).toBe(hashAntes);
        });

        it('invalida el token viejo (sesion_valida_desde) - una peticion posterior con el token anterior es rechazada', async () => {
            /*
            sesionFueInvalidada compara por SEGUNDOS, no milisegundos (ver utils/sesion-revocada.ts) - sin este
            delay, el login de beforeEach y el cambio de usuario de aqui pueden caer en el MISMO segundo de
            reloj y el test fallaria por esa resolucion de 1s, no por un bug real (mismo patron ya usado en
            auth.itest.ts).
            */
            await new Promise((resolve) => setTimeout(resolve, 1100));

            await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ usuario: 'mi_perfil_op_nuevo' });

            const conTokenViejo = await request(app)
                .get('/api/asistencia/mi-historial')
                .set('Authorization', `Bearer ${tokenOperador}`);

            expect(conTokenViejo.status).toBe(401);
        });

        it('un token de cuenta de oficina no puede usar esta ruta', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({ usuario: 'lo que sea' });

            expect(res.status).toBe(403);
        });

        it('rechaza un usuario vacío', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-usuario')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ usuario: '   ' });

            expect(res.status).toBe(400);
        });
    });

    /*
    "Mi Perfil" rediseñado (pedido del usuario, 2026-10-29): el trabajador edita su propio telefono/direccion
    reutilizando PUT /asistencia/operadores/:id (actualizarOperador), antes exclusivo ADMIN/ASISTENTE - ahora
    con permiso condicionado: solo sobre su propio :id, y SOLO telefono/direccion tienen efecto aunque el
    body mande mas campos.
    */
    describe('PUT /api/asistencia/operadores/:id (autoservicio de telefono/direccion)', () => {
        it('el operador edita su propio telefono/direccion', async () => {
            const res = await request(app)
                .put(`/api/asistencia/operadores/${operadorId}`)
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ telefono: '0987654321', direccion: 'Calle Falsa 123' });

            expect(res.status).toBe(200);
            const actualizado = await Operador.findByPk(operadorId);
            expect(actualizado?.telefono).toBe('0987654321');
            expect(actualizado?.direccion).toBe('Calle Falsa 123');
        });

        it('no borra la cédula existente aunque no se mande (regresión del bug real encontrado al construir esto)', async () => {
            const res = await request(app)
                .put(`/api/asistencia/operadores/${operadorId}`)
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ telefono: '0987654321' });

            expect(res.status).toBe(200);
            const actualizado = await Operador.findByPk(operadorId);
            expect(actualizado?.cedula).toBe('1234567890');
            expect(actualizado?.telefono).toBe('0987654321');
        });

        it('ignora cedula/nombre_completo/rol/usuario/clave/supervisor_id aunque vengan en el body', async () => {
            const res = await request(app)
                .put(`/api/asistencia/operadores/${operadorId}`)
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({
                    telefono: '0987654321',
                    cedula: '0000000000', nombre_completo: 'Nombre Hackeado', rol: 'OPERADOR',
                    usuario: 'usuario_robado', clave: 'ClaveRobada123', supervisor_id: 999999,
                });

            expect(res.status).toBe(200);
            const actualizado = await Operador.findByPk(operadorId);
            expect(actualizado?.telefono).toBe('0987654321');
            expect(actualizado?.cedula).toBe('1234567890');
            expect(actualizado?.nombre_completo).toBe('E2E Mi Perfil');
            expect(actualizado?.rol).toBe('MECANICO');
            expect(actualizado?.usuario).toBe('mi_perfil_op');
            expect(actualizado?.supervisor_id).toBe(supervisorId);

            // La clave tampoco cambió - el login viejo sigue sirviendo.
            const loginViejo = await request(app).post('/api/auth/login').send({ usuario: 'mi_perfil_op', clave: 'ClaveOp123456' });
            expect(loginViejo.status).toBe(200);
        });

        it('rechaza editar el registro de OTRO operador (403)', async () => {
            const res = await request(app)
                .put(`/api/asistencia/operadores/${otroOperadorId}`)
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ telefono: '0987654321' });

            expect(res.status).toBe(403);
            const sinCambios = await Operador.findByPk(otroOperadorId);
            expect(sinCambios?.telefono).toBeFalsy();
        });

        it('una cuenta de oficina (ADMIN/ASISTENTE) sigue pudiendo editar cualquier operador con normalidad', async () => {
            const res = await request(app)
                .put(`/api/asistencia/operadores/${otroOperadorId}`)
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({ telefono: '0911111111', nombre_completo: 'Otro Operador Editado' });

            expect(res.status).toBe(200);
            const actualizado = await Operador.findByPk(otroOperadorId);
            expect(actualizado?.telefono).toBe('0911111111');
            expect(actualizado?.nombre_completo).toBe('Otro Operador Editado');
        });
    });

    describe('PUT /api/asistencia/mi-clave', () => {
        it('cambia la clave propia exitosamente - la nueva funciona, la vieja ya no', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-clave')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ clave: 'ClaveNuevaSegura123' });

            expect(res.status).toBe(200);

            const loginNueva = await request(app).post('/api/auth/login').send({ usuario: 'mi_perfil_op', clave: 'ClaveNuevaSegura123' });
            expect(loginNueva.status).toBe(200);

            const loginVieja = await request(app).post('/api/auth/login').send({ usuario: 'mi_perfil_op', clave: 'ClaveOp123456' });
            expect(loginVieja.status).toBe(401);
        });

        it('rechaza una clave de menos de 8 caracteres', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-clave')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ clave: 'corta' });

            expect(res.status).toBe(400);
        });

        it('invalida el token viejo (sesion_valida_desde)', async () => {
            await new Promise((resolve) => setTimeout(resolve, 1100));

            await request(app)
                .put('/api/asistencia/mi-clave')
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ clave: 'ClaveNuevaSegura123' });

            const conTokenViejo = await request(app)
                .get('/api/asistencia/mi-historial')
                .set('Authorization', `Bearer ${tokenOperador}`);

            expect(conTokenViejo.status).toBe(401);
        });

        it('un token de cuenta de oficina no puede usar esta ruta', async () => {
            const res = await request(app)
                .put('/api/asistencia/mi-clave')
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({ clave: 'ClaveNuevaSegura123' });

            expect(res.status).toBe(403);
        });
    });
});
