import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Asistencia } from '../models/asistencias';
import { Operador } from '../models/operador';
import { Hacienda } from '../models/hacienda';
import { CierreJornada } from '../models/cierre_jornada';
import { generarToken } from '../services/jwt.service';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

/*
Editar/Eliminar labor (pedido del usuario, 2026-10-16: corregir equipo/actividad/observacion equivocados, o
borrar por completo una labor mal registrada). El eliminar nunca abre un hueco (solo la ULTIMA labor), ninguno
de los dos toca el catalogo de Equipo/Actividad, y mover hora_inicio/hora_fin al editar sigue siendo
estructuralmente imposible para el propio trabajador (tipo 'operador'), se lo pida o no.

Ampliacion (pedido del usuario, 2026-10-21, ver registro_actividad.controller.ts puedeForzarComoSupervisor):
ADMIN/SUPERVISOR SI pueden, desde el Panel de Supervisor: crear/editar/eliminar labores de un trabajador aunque
su jornada ya no siga EN_JORNADA (mientras el DIA no haya cerrado de verdad con "Cerrar Jornada"), eliminar
saltandose el chequeo de "ultima labor" via 'forzar', y mover hora_inicio/hora_fin al editar. ASISTENTE y un
OPERADOR sobre su propia jornada quedan afuera de las 3 cosas, aunque el primero ya tenga permiso irrestricto
sobre estos endpoints (puedeOperarSobreAsistencia) - ver el describe de abajo.
*/
describe('PUT/DELETE /api/registro-actividades/:id (editar/eliminar labor)', () => {
    let tokenAdmin: string;
    let tokenSupervisor: string;
    let tokenAsistente: string;
    let tokenOperador: string;
    let asistenciaId: number;
    let equipoId: number;
    let actividadId: number;
    let haciendaId: number;
    let adminId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
        const admin = await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        adminId = admin.id;
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Itest' });
        haciendaId = hacienda.id;

        const supervisor = await crearUsuarioDePrueba({ usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaId });
        const loginSupervisor = await request(app).post('/api/auth/login').send({ usuario: 'supervisor1', clave: 'claveprueba123' });
        tokenSupervisor = loginSupervisor.body.token;

        await crearUsuarioDePrueba({ usuario: 'asistente1', clave: 'claveprueba123', cargo: 'ASISTENTE' });
        const loginAsistente = await request(app).post('/api/auth/login').send({ usuario: 'asistente1', clave: 'claveprueba123' });
        tokenAsistente = loginAsistente.body.token;

        const equipo = await request(app)
            .post('/api/equipos')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ codigo_megued: 'EQ-ITEST', nombre_equipo: 'Tractor de prueba' });
        equipoId = equipo.body.id;

        const actividad = await request(app)
            .post('/api/actividad/nueva')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ codigo_megued: 'ACT-ITEST', description: 'Arado de prueba' });
        actividadId = actividad.body.id;

        const operador = await Operador.create({
            nombre_completo: 'Operador Itest',
            codigo_megued: 'OP-ITEST',
            supervisor_id: supervisor.id,
        });
        tokenOperador = generarToken({ id: operador.id, tipo: 'operador', rol: 'OPERADOR', hacienda_id: haciendaId });

        const asistencia = await Asistencia.create({
            operador_id: operador.id,
            fecha: new Date().toISOString().slice(0, 10),
            hora_ingreso: new Date(),
            estado: 'EN_JORNADA',
        });
        asistenciaId = asistencia.id;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    const crearLabor = (horaInicio: string, token: string = tokenAdmin) =>
        request(app)
            .post('/api/registro-actividades')
            .set('Authorization', `Bearer ${token}`)
            .send({ asistencia_id: asistenciaId, equipo_id: equipoId, actividad_id: actividadId, hora_inicio: horaInicio });

    it('solo deja eliminar la ULTIMA labor de la jornada - rechaza una de en medio (no abre huecos)', async () => {
        const l1 = await crearLabor('2026-10-16T07:00:00.000Z');
        const l2 = await crearLabor('2026-10-16T09:00:00.000Z');
        const l3 = await crearLabor('2026-10-16T11:00:00.000Z');
        expect(l1.status).toBe(201);
        expect(l2.status).toBe(201);
        expect(l3.status).toBe(201);

        const rechazada = await request(app)
            .delete(`/api/registro-actividades/${l1.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(rechazada.status).toBe(400);
        expect(rechazada.body.message).toContain('última');

        const rechazadaDelMedio = await request(app)
            .delete(`/api/registro-actividades/${l2.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(rechazadaDelMedio.status).toBe(400);

        const aceptada = await request(app)
            .delete(`/api/registro-actividades/${l3.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(aceptada.status).toBe(200);

        // Tras borrar la 3, la 2 pasa a ser la nueva "última" - ahora sí se puede borrar, confirmando que el
        // eliminar siempre achica la lista desde el final, nunca deja un hueco en medio.
        const ahoraSiAceptada = await request(app)
            .delete(`/api/registro-actividades/${l2.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(ahoraSiAceptada.status).toBe(200);

        const restantes = await request(app)
            .get(`/api/registro-actividades?asistencia_id=${asistenciaId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(restantes.body).toHaveLength(1);
        expect(restantes.body[0].id).toBe(l1.body.id);
    });

    it('eliminar una labor nunca toca el catálogo de Equipo/Actividad (siguen existiendo y usables)', async () => {
        const l1 = await crearLabor('2026-10-16T07:00:00.000Z');

        await request(app).delete(`/api/registro-actividades/${l1.body.id}`).set('Authorization', `Bearer ${tokenAdmin}`);

        const equipos = await request(app).get('/api/equipos?pagina=1&limite=20').set('Authorization', `Bearer ${tokenAdmin}`);
        expect(equipos.body.data.some((e: any) => e.id === equipoId)).toBe(true);

        const actividades = await request(app).get('/api/actividad');
        expect(actividades.body.some((a: any) => a.id === actividadId)).toBe(true);

        // El mismo equipo/actividad siguen sirviendo para registrar una labor nueva.
        const nueva = await crearLabor('2026-10-16T08:00:00.000Z');
        expect(nueva.status).toBe(201);
    });

    it('editar corrige equipo/actividad/observaciones sin tocar hora_inicio/hora_fin si no se piden', async () => {
        const creada = await crearLabor('2026-10-16T07:00:00.000Z');
        const horaOriginal = creada.body.hora_inicio;

        const equipo2 = await request(app)
            .post('/api/equipos')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ codigo_megued: 'EQ-ITEST-2', nombre_equipo: 'Cosechadora de prueba' });

        const editada = await request(app)
            .put(`/api/registro-actividades/${creada.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({
                equipo_id: equipo2.body.id,
                observaciones: 'Corregido via editar',
            });

        expect(editada.status).toBe(200);
        expect(editada.body.registro.equipo_id).toBe(equipo2.body.id);
        expect(editada.body.registro.observaciones).toBe('Corregido via editar');
        expect(new Date(editada.body.registro.hora_inicio).toISOString()).toBe(new Date(horaOriginal).toISOString());
        expect(editada.body.registro.hora_fin).toBeNull();
    });

    it('rechaza editar/eliminar una labor de una jornada que ya no esta EN_JORNADA (operador sobre su propia jornada)', async () => {
        const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenOperador);
        await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });

        const editar = await request(app)
            .put(`/api/registro-actividades/${creada.body.id}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({ observaciones: 'no deberia aplicar' });
        expect(editar.status).toBe(400);

        const eliminar = await request(app)
            .delete(`/api/registro-actividades/${creada.body.id}`)
            .set('Authorization', `Bearer ${tokenOperador}`);
        expect(eliminar.status).toBe(400);
    });

    describe('ampliaciones del Panel de Supervisor (forzar fuera de EN_JORNADA, "forzar eliminar", editar horas)', () => {
        it('ADMIN/SUPERVISOR pueden crear, editar y eliminar labores aunque la jornada ya no este EN_JORNADA, si el día no cerró', async () => {
            await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });

            const creadaAdmin = await crearLabor('2026-10-16T07:00:00.000Z', tokenAdmin);
            expect(creadaAdmin.status).toBe(201);

            const creadaSupervisor = await crearLabor('2026-10-16T08:00:00.000Z', tokenSupervisor);
            expect(creadaSupervisor.status).toBe(201);

            const editada = await request(app)
                .put(`/api/registro-actividades/${creadaSupervisor.body.id}`)
                .set('Authorization', `Bearer ${tokenSupervisor}`)
                .send({ observaciones: 'corregido fuera de EN_JORNADA' });
            expect(editada.status).toBe(200);

            const eliminada = await request(app)
                .delete(`/api/registro-actividades/${creadaSupervisor.body.id}`)
                .set('Authorization', `Bearer ${tokenSupervisor}`);
            expect(eliminada.status).toBe(200);
        });

        it('se rechaza el bypass de EN_JORNADA si el DIA ya cerró con "Cerrar Jornada" - ni ADMIN lo salta', async () => {
            await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });
            await CierreJornada.create({
                hacienda_id: haciendaId,
                fecha: new Date().toISOString().slice(0, 10),
                cerrado_por_usuario_id: adminId,
            });

            const rechazada = await crearLabor('2026-10-16T09:00:00.000Z', tokenAdmin);
            expect(rechazada.status).toBe(400);
        });

        it('un OPERADOR en su propia jornada no puede saltarse EN_JORNADA aunque mande forzar:true', async () => {
            await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });

            const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenOperador);
            expect(creada.status).toBe(400);
        });

        it('ASISTENTE no tiene el bypass de EN_JORNADA aunque el permiso normal ya lo deje operar sobre cualquier asistencia', async () => {
            await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });

            const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenAsistente);
            expect(creada.status).toBe(400);
        });

        it('un trabajador marcado OBSERVANDO YA NO queda afuera del bypass de EN_JORNADA (pedido del usuario, 2026-10-27: O/X es solo un contador)', async () => {
            await Asistencia.update({ estado: 'OBSERVANDO' }, { where: { id: asistenciaId } });

            const creadaAdmin = await crearLabor('2026-10-16T07:00:00.000Z', tokenAdmin);
            expect(creadaAdmin.status).toBe(201);

            const creadaSupervisor = await crearLabor('2026-10-16T08:00:00.000Z', tokenSupervisor);
            expect(creadaSupervisor.status).toBe(201);

            // Tambien se puede editar y eliminar, igual que con cualquier otro estado fuera de EN_JORNADA.
            const editada = await request(app)
                .put(`/api/registro-actividades/${creadaSupervisor.body.id}`)
                .set('Authorization', `Bearer ${tokenSupervisor}`)
                .send({ observaciones: 'corregido aunque este OBSERVANDO' });
            expect(editada.status).toBe(200);

            const eliminada = await request(app)
                .delete(`/api/registro-actividades/${creadaSupervisor.body.id}`)
                .set('Authorization', `Bearer ${tokenSupervisor}`);
            expect(eliminada.status).toBe(200);
        });

        it('un OPERADOR en su propia jornada marcada OBSERVANDO sigue sin poder saltarse EN_JORNADA', async () => {
            await Asistencia.update({ estado: 'OBSERVANDO' }, { where: { id: asistenciaId } });

            const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenOperador);
            expect(creada.status).toBe(400);
        });

        it('"forzar" elimina una labor que no es la última, cuando lo pide ADMIN/SUPERVISOR', async () => {
            const l1 = await crearLabor('2026-10-16T07:00:00.000Z');
            const l2 = await crearLabor('2026-10-16T09:00:00.000Z');

            const aceptada = await request(app)
                .delete(`/api/registro-actividades/${l1.body.id}`)
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({ forzar: true });
            expect(aceptada.status).toBe(200);

            const restantes = await request(app)
                .get(`/api/registro-actividades?asistencia_id=${asistenciaId}`)
                .set('Authorization', `Bearer ${tokenAdmin}`);
            expect(restantes.body).toHaveLength(1);
            expect(restantes.body[0].id).toBe(l2.body.id);
        });

        it('"forzar" nunca tiene efecto para un OPERADOR sobre su propia jornada - sigue sin poder eliminar del medio', async () => {
            const l1 = await crearLabor('2026-10-16T07:00:00.000Z', tokenOperador);
            await crearLabor('2026-10-16T09:00:00.000Z', tokenOperador);

            const rechazada = await request(app)
                .delete(`/api/registro-actividades/${l1.body.id}`)
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({ forzar: true });
            expect(rechazada.status).toBe(400);
        });

        it('ADMIN/SUPERVISOR pueden mover hora_inicio Y hora_fin de una labor al editarla', async () => {
            const creada = await crearLabor('2026-10-16T07:00:00.000Z');

            const editada = await request(app)
                .put(`/api/registro-actividades/${creada.body.id}`)
                .set('Authorization', `Bearer ${tokenSupervisor}`)
                .send({
                    hora_inicio: '2026-10-16T06:00:00.000Z',
                    hora_fin: '2026-10-16T08:00:00.000Z',
                });

            expect(editada.status).toBe(200);
            expect(new Date(editada.body.registro.hora_inicio).toISOString()).toBe('2026-10-16T06:00:00.000Z');
            expect(new Date(editada.body.registro.hora_fin).toISOString()).toBe('2026-10-16T08:00:00.000Z');
        });

        it('rechaza mover la hora si hora_fin queda antes de hora_inicio, aunque lo pida ADMIN/SUPERVISOR', async () => {
            const creada = await crearLabor('2026-10-16T07:00:00.000Z');

            const rechazada = await request(app)
                .put(`/api/registro-actividades/${creada.body.id}`)
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({
                    hora_inicio: '2026-10-16T08:00:00.000Z',
                    hora_fin: '2026-10-16T07:00:00.000Z',
                });

            expect(rechazada.status).toBe(400);
        });

        it('un OPERADOR editando su propia jornada sigue sin poder mover hora_inicio/hora_fin aunque las mande', async () => {
            const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenOperador);
            const horaOriginal = creada.body.hora_inicio;

            const editada = await request(app)
                .put(`/api/registro-actividades/${creada.body.id}`)
                .set('Authorization', `Bearer ${tokenOperador}`)
                .send({
                    observaciones: 'intento de mover hora',
                    hora_inicio: '2099-01-01T00:00:00.000Z',
                    hora_fin: '2099-01-01T01:00:00.000Z',
                });

            expect(editada.status).toBe(200);
            expect(new Date(editada.body.registro.hora_inicio).toISOString()).toBe(new Date(horaOriginal).toISOString());
            expect(editada.body.registro.hora_fin).toBeNull();
        });

        /*
        Reproduccion del bug reportado en produccion, 2026-10-21 (ver MEMORY.md/plan): un ADMIN (no un
        SUPERVISOR autenticado directo) edita la hora de una labor de una asistencia FINALIZADA, sin
        hacienda_prestamo_id, con el dia de la hacienda SIN cerrar. Esperado: 200, igual que ya cubre la
        prueba de arriba con tokenSupervisor - esta prueba usa tokenAdmin a proposito para descartar que el
        bug sea especifico del rol ADMIN vs SUPERVISOR.
        */
        it('[reproduccion] ADMIN puede editar la hora de una labor FINALIZADA (sin prestamo, dia abierto)', async () => {
            await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });
            const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenAdmin);

            const editada = await request(app)
                .put(`/api/registro-actividades/${creada.body.id}`)
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({
                    hora_inicio: '2026-10-16T06:00:00.000Z',
                    hora_fin: '2026-10-16T08:00:00.000Z',
                });

            expect(editada.status).toBe(200);
            expect(new Date(editada.body.registro.hora_inicio).toISOString()).toBe('2026-10-16T06:00:00.000Z');
            expect(new Date(editada.body.registro.hora_fin).toISOString()).toBe('2026-10-16T08:00:00.000Z');
        });

        /*
        Reproduccion del segundo sintoma reportado: ADMIN editando la hora de una labor de una asistencia que
        SIGUE EN_JORNADA (no finalizada) - el reporte decia que el guardado "funciona" (200, otros campos
        cambian) pero la hora editada nunca se refleja. Si esta prueba falla en la aserción de la hora (pero
        pasa en el status 200), confirma exactamente ese sintoma.
        */
        it('[reproduccion] ADMIN puede editar la hora de una labor EN_JORNADA (sin finalizar, sin prestamo)', async () => {
            const creada = await crearLabor('2026-10-16T07:00:00.000Z', tokenAdmin);

            const editada = await request(app)
                .put(`/api/registro-actividades/${creada.body.id}`)
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({
                    hora_inicio: '2026-10-16T06:00:00.000Z',
                    hora_fin: '2026-10-16T08:00:00.000Z',
                });

            expect(editada.status).toBe(200);
            expect(new Date(editada.body.registro.hora_inicio).toISOString()).toBe('2026-10-16T06:00:00.000Z');
            expect(new Date(editada.body.registro.hora_fin).toISOString()).toBe('2026-10-16T08:00:00.000Z');
        });
    });
});
