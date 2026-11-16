import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

/*
GET /api/asistencia/historial, filtro por Supervisor (pedido del usuario, 2026-11-16): el Panel de
Asistente/ADMIN ahora deja elegir uno o VARIOS Supervisores a la vez (checklist en el frontend, en vez del
<select> de uno solo que habia antes) para "Exportar a Excel"/"Imprimir Hojas del rango" de un subconjunto
puntual, sin tener que traer TODAS las haciendas. El backend recibe 'supervisor_id' repetido en la query
(?supervisor_id=1&supervisor_id=2) y filtra por cualquiera de esos (Op.in) - con un solo valor se comporta
exactamente igual que antes (sigue cubierto por el resto de pruebas de integracion existentes).
*/
describe('GET /api/asistencia/historial (filtro por uno o varios supervisor_id)', () => {
    let tokenAdmin: string;
    let sup1Id: number;
    let sup2Id: number;
    let sup3Id: number;
    let op1Id: number;
    let op2Id: number;
    let op3Id: number;

    const crearAsistenciaCerrada = (operadorId: number) =>
        Asistencia.create({
            operador_id: operadorId,
            fecha: new Date().toISOString().slice(0, 10),
            hora_ingreso: new Date(),
            hora_salida: new Date(),
            estado: 'FINALIZADO',
            confirmado_por_supervisor: true,
        });

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda1 = await Hacienda.create({ nombre: 'Hacienda Uno' });
        const hacienda2 = await Hacienda.create({ nombre: 'Hacienda Dos' });
        const hacienda3 = await Hacienda.create({ nombre: 'Hacienda Tres' });

        const admin = await crearUsuarioDePrueba({ usuario: 'admin_historial', clave: 'claveprueba123', cargo: 'ADMIN' });
        const sup1 = await crearUsuarioDePrueba({ usuario: 'sup1_historial', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda1.id });
        const sup2 = await crearUsuarioDePrueba({ usuario: 'sup2_historial', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda2.id });
        const sup3 = await crearUsuarioDePrueba({ usuario: 'sup3_historial', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda3.id });
        sup1Id = sup1.id;
        sup2Id = sup2.id;
        sup3Id = sup3.id;

        const op1 = await Operador.create({ nombre_completo: 'Operador Uno', codigo_megued: 'OP-H1', supervisor_id: sup1Id });
        const op2 = await Operador.create({ nombre_completo: 'Operador Dos', codigo_megued: 'OP-H2', supervisor_id: sup2Id });
        const op3 = await Operador.create({ nombre_completo: 'Operador Tres', codigo_megued: 'OP-H3', supervisor_id: sup3Id });
        op1Id = op1.id;
        op2Id = op2.id;
        op3Id = op3.id;

        await crearAsistenciaCerrada(op1Id);
        await crearAsistenciaCerrada(op2Id);
        await crearAsistenciaCerrada(op3Id);

        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin_historial', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;
        void admin;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('sin supervisor_id devuelve a los 3 (comportamiento "Todos", sin cambios)', async () => {
        const res = await request(app)
            .get('/api/asistencia/historial')
            .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(res.status).toBe(200);
        expect(res.body.data.map((a: any) => a.operador_id).sort()).toEqual([op1Id, op2Id, op3Id].sort());
    });

    it('con un solo supervisor_id sigue filtrando a ese unico Supervisor (compatibilidad con el <select> de antes)', async () => {
        const res = await request(app)
            .get(`/api/asistencia/historial?supervisor_id=${sup2Id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(res.status).toBe(200);
        expect(res.body.data.map((a: any) => a.operador_id)).toEqual([op2Id]);
    });

    it('con varios supervisor_id devuelve la union de esos Supervisores, excluyendo al resto', async () => {
        const res = await request(app)
            .get(`/api/asistencia/historial?supervisor_id=${sup1Id}&supervisor_id=${sup3Id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(res.status).toBe(200);
        expect(res.body.data.map((a: any) => a.operador_id).sort()).toEqual([op1Id, op3Id].sort());
        expect(res.body.total).toBe(2);
    });
});
