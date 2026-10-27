import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { CierreJornada } from '../models/cierre_jornada';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

/*
Botones O/X del Panel de Supervisor (PUT /:id/confirmar). Pedido del usuario, 2026-10-27: O/X pasa a ser
SOLO un contador para poder cerrar la jornada (finalizarDia ya exige confirmado_por_supervisor no nulo en
cada fila, eso no cambia aqui) - ya no debe quedar bloqueando el "+"/Ver/Imprimir para siempre. Antes de
este cambio, "O" solo actualizaba confirmado_por_supervisor, y si el estado ya estaba en OBSERVANDO (por una
X previa, sea por error o porque el Supervisor cambio de opinion) se quedaba trabado ahi para siempre -
confirmado con capturas reales en produccion (trabajador con "O" resaltado que seguia mostrando "No aplica"
y sin el boton "+").
*/
describe('PUT /api/asistencia/:id/confirmar (O/X del Supervisor)', () => {
    let tokenSupervisor: string;
    let supervisorId: number;
    let haciendaId: number;
    let operadorId: number;

    const crearAsistencia = (datos: Partial<{ estado: 'EN_JORNADA' | 'PENDIENTE_REVISION' | 'FINALIZADO' | 'SALIDA_OLVIDADA' | 'OBSERVANDO'; hora_salida: Date | null }> = {}) =>
        Asistencia.create({
            operador_id: operadorId,
            fecha: new Date().toISOString().slice(0, 10),
            hora_ingreso: new Date(),
            estado: 'EN_JORNADA',
            ...datos,
        });

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Confirmar' });
        haciendaId = hacienda.id;

        const supervisor = await crearUsuarioDePrueba({
            usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaId,
        });
        supervisorId = supervisor.id;

        const operador = await Operador.create({
            nombre_completo: 'Operador Confirmar', codigo_megued: 'OP-CONFIRMAR', supervisor_id: supervisorId,
        });
        operadorId = operador.id;

        const login = await request(app).post('/api/auth/login').send({ usuario: 'supervisor1', clave: 'claveprueba123' });
        tokenSupervisor = login.body.token;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('X (presente:false) marca OBSERVANDO con nota automatica, igual que antes', async () => {
        const asistencia = await crearAsistencia();

        const res = await request(app)
            .put(`/api/asistencia/${asistencia.id}/confirmar`)
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ presente: false });

        expect(res.status).toBe(200);
        const actualizada = await Asistencia.findByPk(asistencia.id);
        expect(actualizada?.estado).toBe('OBSERVANDO');
        expect(actualizada?.confirmado_por_supervisor).toBe(false);
        expect(actualizada?.observaciones).toContain('Marcado como NO presente por el supervisor');
    });

    it('O (presente:true) normal, sin pasar por X, no toca el estado', async () => {
        const asistencia = await crearAsistencia({ estado: 'PENDIENTE_REVISION', hora_salida: new Date() });

        const res = await request(app)
            .put(`/api/asistencia/${asistencia.id}/confirmar`)
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ presente: true });

        expect(res.status).toBe(200);
        const actualizada = await Asistencia.findByPk(asistencia.id);
        expect(actualizada?.estado).toBe('PENDIENTE_REVISION');
        expect(actualizada?.confirmado_por_supervisor).toBe(true);
    });

    it('O despues de X desatasca el OBSERVANDO: sin hora_salida vuelve a EN_JORNADA', async () => {
        const asistencia = await crearAsistencia({ estado: 'OBSERVANDO', hora_salida: null });

        const res = await request(app)
            .put(`/api/asistencia/${asistencia.id}/confirmar`)
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ presente: true });

        expect(res.status).toBe(200);
        const actualizada = await Asistencia.findByPk(asistencia.id);
        expect(actualizada?.estado).toBe('EN_JORNADA');
        expect(actualizada?.confirmado_por_supervisor).toBe(true);
    });

    it('O despues de X desatasca el OBSERVANDO: con hora_salida ya marcada vuelve a PENDIENTE_REVISION', async () => {
        const asistencia = await crearAsistencia({ estado: 'OBSERVANDO', hora_salida: new Date() });

        const res = await request(app)
            .put(`/api/asistencia/${asistencia.id}/confirmar`)
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ presente: true });

        expect(res.status).toBe(200);
        const actualizada = await Asistencia.findByPk(asistencia.id);
        expect(actualizada?.estado).toBe('PENDIENTE_REVISION');
        expect(actualizada?.confirmado_por_supervisor).toBe(true);
    });

    it('dia cerrado sigue bloqueando tanto O como X, igual que antes', async () => {
        const asistencia = await crearAsistencia({ estado: 'OBSERVANDO', hora_salida: null });
        await CierreJornada.create({
            hacienda_id: haciendaId,
            fecha: new Date().toISOString().slice(0, 10),
            cerrado_por_usuario_id: supervisorId,
        });

        const resO = await request(app)
            .put(`/api/asistencia/${asistencia.id}/confirmar`)
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ presente: true });
        expect(resO.status).toBe(400);

        const resX = await request(app)
            .put(`/api/asistencia/${asistencia.id}/confirmar`)
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ presente: false });
        expect(resX.status).toBe(400);

        const sinCambios = await Asistencia.findByPk(asistencia.id);
        expect(sinCambios?.estado).toBe('OBSERVANDO');
    });
});
