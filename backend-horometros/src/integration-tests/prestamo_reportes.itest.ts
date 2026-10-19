import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Usuario } from '../models/usuario';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';
import { obtenerFechaLocalEcuador } from '../utils/fecha-ecuador';

/*
Trabajador prestado en reportes (pedido del usuario, 2026-10-19): una jornada con hacienda_prestamo_id
debe aparecer en obtenerAsistenciaHoy/obtenerHistorial de la hacienda que lo RECIBIO, y dejar de aparecer
ese mismo dia en los de su hacienda de ORIGEN - nunca en las dos a la vez (ver CLAUDE.md regla 9,
"EXCEPCION 2026-10-19"). El Directorio de Operadores (nomina permanente) nunca se toca.
*/
describe('Trabajador prestado: a qué hacienda se reporta su jornada', () => {
    let hacienda1Id: number;
    let hacienda2Id: number;
    let hacienda3Id: number;
    let tokenSupervisor1: string;
    let tokenSupervisor2: string;
    let tokenSupervisor3: string;
    let tokenAdmin: string;
    let operadorId: number;
    let asistenciaId: number;
    const hoy = obtenerFechaLocalEcuador();

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda1 = await Hacienda.create({ nombre: 'Hacienda Origen' });
        const hacienda2 = await Hacienda.create({ nombre: 'Hacienda Receptora' });
        const hacienda3 = await Hacienda.create({ nombre: 'Hacienda Ajena' });
        hacienda1Id = hacienda1.id;
        hacienda2Id = hacienda2.id;
        hacienda3Id = hacienda3.id;

        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;

        await crearUsuarioDePrueba({ usuario: 'sup1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda1Id });
        await crearUsuarioDePrueba({ usuario: 'sup2', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda2Id });
        await crearUsuarioDePrueba({ usuario: 'sup3', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda3Id });

        const loginSup1 = await request(app).post('/api/auth/login').send({ usuario: 'sup1', clave: 'claveprueba123' });
        tokenSupervisor1 = loginSup1.body.token;
        const loginSup2 = await request(app).post('/api/auth/login').send({ usuario: 'sup2', clave: 'claveprueba123' });
        tokenSupervisor2 = loginSup2.body.token;
        const loginSup3 = await request(app).post('/api/auth/login').send({ usuario: 'sup3', clave: 'claveprueba123' });
        tokenSupervisor3 = loginSup3.body.token;

        const crearOperador = await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Trabajador Prestado', codigo_megued: 'PREST-001' });
        operadorId = crearOperador.body.id;

        // Asignar su Supervisor fijo (Hacienda 1) - la nomina/ficha permanente.
        const sup1 = await Usuario.findOne({ where: { usuario: 'sup1' } });
        await Operador.update({ supervisor_id: sup1!.id }, { where: { id: operadorId } });

        // Jornada de HOY, prestado a Hacienda 2, ya cerrada y confirmada (para que obtenerHistorial la traiga).
        const asistencia = await Asistencia.create({
            operador_id: operadorId,
            fecha: hoy,
            hora_ingreso: new Date(),
            hora_salida: new Date(),
            estado: 'FINALIZADO',
            confirmado_por_supervisor: true,
            hacienda_prestamo_id: hacienda2Id,
        });
        asistenciaId = asistencia.id;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('obtenerAsistenciaHoy: el Supervisor de la hacienda RECEPTORA ve la jornada prestada', async () => {
        const res = await request(app).get('/api/asistencia/hoy').set('Authorization', `Bearer ${tokenSupervisor2}`);
        expect(res.status).toBe(200);
        expect(res.body.data.some((a: any) => a.id === asistenciaId)).toBe(true);
    });

    it('obtenerAsistenciaHoy: el Supervisor de la hacienda de ORIGEN NO ve esa jornada ese día', async () => {
        const res = await request(app).get('/api/asistencia/hoy').set('Authorization', `Bearer ${tokenSupervisor1}`);
        expect(res.status).toBe(200);
        expect(res.body.data.some((a: any) => a.id === asistenciaId)).toBe(false);
    });

    it('obtenerAsistenciaHoy: un Supervisor de una tercera hacienda ajena tampoco la ve', async () => {
        const res = await request(app).get('/api/asistencia/hoy').set('Authorization', `Bearer ${tokenSupervisor3}`);
        expect(res.status).toBe(200);
        expect(res.body.data.some((a: any) => a.id === asistenciaId)).toBe(false);
    });

    it('obtenerHistorial: filtrando por la hacienda RECEPTORA, la jornada prestada aparece', async () => {
        const res = await request(app)
            .get('/api/asistencia/historial')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .query({ fecha_inicio: hoy, fecha_fin: hoy, hacienda_id: hacienda2Id });
        expect(res.status).toBe(200);
        expect(res.body.data.some((a: any) => a.id === asistenciaId)).toBe(true);
    });

    it('obtenerHistorial: filtrando por la hacienda de ORIGEN, esa jornada NO aparece ese día', async () => {
        const res = await request(app)
            .get('/api/asistencia/historial')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .query({ fecha_inicio: hoy, fecha_fin: hoy, hacienda_id: hacienda1Id });
        expect(res.status).toBe(200);
        expect(res.body.data.some((a: any) => a.id === asistenciaId)).toBe(false);
    });

    it('obtenerHistorial: sin ningún filtro de hacienda/supervisor, la jornada sigue apareciendo (sin cambios)', async () => {
        const res = await request(app)
            .get('/api/asistencia/historial')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .query({ fecha_inicio: hoy, fecha_fin: hoy });
        expect(res.status).toBe(200);
        expect(res.body.data.some((a: any) => a.id === asistenciaId)).toBe(true);
    });

    it('Directorio de Operadores: el trabajador sigue apareciendo bajo su Supervisor/hacienda de ORIGEN, sin cambios', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .query({ q: 'PREST-001' });
        expect(res.status).toBe(200);
        // Sin pagina/limite, obtenerOperadores devuelve un arreglo plano (no envuelto en { data }).
        const operador = res.body.find((o: any) => o.id === operadorId);
        expect(operador).toBeDefined();
        expect(operador.supervisor.hacienda_id).toBe(hacienda1Id);
    });

    /*
    "Exportar a Excel" del Panel de Supervisor arma cada fila pidiendo las labores del operador via
    obtenerRegistrosPorOperador (GET /por-operador), acotado al mismo dia - sin la excepcion de prestamo en
    puedeVerHistorialDeOperador, esto fallaba con 403 para el Supervisor RECEPTOR aunque ya viera al
    trabajador en su lista de "hoy" (bug real encontrado al verificar el flujo completo, no solo la lista).
    */
    it('GET /registro-actividades/por-operador: el Supervisor RECEPTOR SI puede pedir las labores de ESE día', async () => {
        const res = await request(app)
            .get('/api/registro-actividades/por-operador')
            .set('Authorization', `Bearer ${tokenSupervisor2}`)
            .query({ operador_id: operadorId, fecha_inicio: hoy, fecha_fin: hoy });
        expect(res.status).toBe(200);
    });

    it('GET /registro-actividades/por-operador: el Supervisor de ORIGEN también puede (sigue siendo el dueño permanente)', async () => {
        const res = await request(app)
            .get('/api/registro-actividades/por-operador')
            .set('Authorization', `Bearer ${tokenSupervisor1}`)
            .query({ operador_id: operadorId, fecha_inicio: hoy, fecha_fin: hoy });
        expect(res.status).toBe(200);
    });

    it('GET /registro-actividades/por-operador: un Supervisor ajeno sigue sin poder, incluso con el mismo rango de fechas', async () => {
        const res = await request(app)
            .get('/api/registro-actividades/por-operador')
            .set('Authorization', `Bearer ${tokenSupervisor3}`)
            .query({ operador_id: operadorId, fecha_inicio: hoy, fecha_fin: hoy });
        expect(res.status).toBe(403);
    });

    it('GET /registro-actividades/por-operador: el Supervisor RECEPTOR sigue SIN acceso al historial completo (sin rango de fechas)', async () => {
        const res = await request(app)
            .get('/api/registro-actividades/por-operador')
            .set('Authorization', `Bearer ${tokenSupervisor2}`)
            .query({ operador_id: operadorId });
        expect(res.status).toBe(403);
    });
});
