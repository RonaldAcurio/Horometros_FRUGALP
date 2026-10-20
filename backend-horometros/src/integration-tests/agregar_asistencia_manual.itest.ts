import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { CierreJornada } from '../models/cierre_jornada';
import { RegistroAuditoria } from '../models/registro_auditoria';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';
import { obtenerFechaLocalEcuador } from '../utils/fecha-ecuador';

/*
Boton "+ Agregar Usuario" del Panel de Supervisor (pedido del usuario, 2026-10-20): el Supervisor mete a mano
a un trabajador que no llego a marcar su entrada hoy. La Asistencia creada tiene que quedar INDISTINGUIBLE de
una marcada normalmente (estado EN_JORNADA, misma forma) - estas pruebas cubren el alcance (SUPERVISOR solo
sus propios trabajadores), las mismas reglas que ya rigen una entrada normal (una jornada por dia, dia ya
cerrado), y que la auditoria quede registrada.
*/
describe('POST /api/asistencia/agregar-manual', () => {
    let tokenSupervisor: string;
    let supervisorId: number;
    let haciendaId: number;
    let operadorPropioId: number;
    let operadorAjenoId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Agregar Manual' });
        haciendaId = hacienda.id;
        const haciendaAjena = await Hacienda.create({ nombre: 'Hacienda Ajena' });

        const supervisor = await crearUsuarioDePrueba({
            usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaId,
        });
        supervisorId = supervisor.id;

        const supervisorAjeno = await crearUsuarioDePrueba({
            usuario: 'supervisorAjeno', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaAjena.id,
        });

        const operadorPropio = await Operador.create({
            nombre_completo: 'Operador Propio', codigo_megued: 'OP-PROPIO', supervisor_id: supervisorId,
        });
        operadorPropioId = operadorPropio.id;

        const operadorAjeno = await Operador.create({
            nombre_completo: 'Operador Ajeno', codigo_megued: 'OP-AJENO', supervisor_id: supervisorAjeno.id,
        });
        operadorAjenoId = operadorAjeno.id;

        const login = await request(app).post('/api/auth/login').send({ usuario: 'supervisor1', clave: 'claveprueba123' });
        tokenSupervisor = login.body.token;
    });

    it('SUPERVISOR agrega a su propio trabajador - crea Asistencia EN_JORNADA identica a una marcacion normal', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.estado).toBe('EN_JORNADA');
        expect(res.body.asistencia.operador_id).toBe(operadorPropioId);
        expect(res.body.asistencia.hora_ingreso).toBeTruthy();
        expect(res.body.asistencia.admitido_por_usuario_id).toBe(supervisorId);

        const auditoria = await RegistroAuditoria.findOne({ where: { accion: 'AGREGAR_ASISTENCIA_MANUAL' } });
        expect(auditoria).not.toBeNull();
        expect(auditoria?.objetivo_id).toBe(operadorPropioId);
        expect(auditoria?.actor_usuario_id).toBe(supervisorId);
    });

    it('SUPERVISOR no puede agregar a un trabajador que no es suyo', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorAjenoId });

        expect(res.status).toBe(403);
    });

    it('rechaza si el operador ya tiene una asistencia registrada hoy', async () => {
        const primera = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId });
        expect(primera.status).toBe(201);

        const segunda = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId });
        expect(segunda.status).toBe(400);
    });

    it('rechaza si el trabajador ya tiene una jornada EN_JORNADA sin cerrar de otro dia', async () => {
        await Asistencia.create({
            operador_id: operadorPropioId,
            fecha: '2026-10-01',
            hora_ingreso: new Date('2026-10-01T10:00:00.000Z'),
            estado: 'EN_JORNADA',
        });

        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('2026-10-01');
    });

    it('rechaza si el Supervisor ya cerro la jornada de hoy para su hacienda', async () => {
        await CierreJornada.create({
            hacienda_id: haciendaId,
            fecha: obtenerFechaLocalEcuador(),
            cerrado_por_usuario_id: supervisorId,
        });

        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId });

        expect(res.status).toBe(403);
    });

    it('rechaza operador_id inexistente', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: 999999 });

        expect(res.status).toBe(404);
    });
});

describe('GET /api/asistencia/operadores (acotado para SUPERVISOR)', () => {
    let tokenSupervisor: string;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Propia' });
        const haciendaAjena = await Hacienda.create({ nombre: 'Hacienda Ajena' });

        const supervisor = await crearUsuarioDePrueba({
            usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda.id,
        });
        const supervisorAjeno = await crearUsuarioDePrueba({
            usuario: 'supervisorAjeno', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaAjena.id,
        });

        await Operador.create({ nombre_completo: 'Operador Propio', codigo_megued: 'OP-PROPIO', supervisor_id: supervisor.id });
        await Operador.create({ nombre_completo: 'Operador Ajeno', codigo_megued: 'OP-AJENO', supervisor_id: supervisorAjeno.id });

        const login = await request(app).post('/api/auth/login').send({ usuario: 'supervisor1', clave: 'claveprueba123' });
        tokenSupervisor = login.body.token;
    });

    it('un SUPERVISOR solo ve a sus propios trabajadores, nunca los de otra hacienda', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20')
            .set('Authorization', `Bearer ${tokenSupervisor}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Operador Propio');
    });
});

afterAll(async () => {
    await sequelize.close();
});
