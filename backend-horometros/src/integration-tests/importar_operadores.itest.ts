import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Seccion } from '../models/seccion';
import { Operador } from '../models/operador';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

/*
Importación masiva de Trabajadores (pestaña "Directorio de Operadores" del Panel de Asistente). Columna
"area" nueva (pedido del usuario, 2026-11-02): exclusiva de la plantilla de Operadores - resuelve/crea la
Sección dentro de la hacienda del "Jefe Inmediato" (supervisor) de esa misma fila, nunca huérfana.
*/
describe('POST /api/asistencia/operadores/importar', () => {
    let tokenAdmin: string;
    let haciendaId: number;
    let supervisorNombre: string;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Importar' });
        haciendaId = hacienda.id;

        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const supervisor = await crearUsuarioDePrueba({
            usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaId,
        });
        supervisorNombre = supervisor.nombre_completo;

        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    const headers = () => ({ Authorization: `Bearer ${tokenAdmin}` });

    it('importa filas normales (sin área) tal como siempre - comportamiento base sin romper nada', async () => {
        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [
                { nombre_completo: 'Juan Perez', codigo_megued: 'MEC-001', rol: 'MECANICO' },
                { nombre_completo: 'Maria Lopez', codigo_megued: 'MEC-002', supervisor: supervisorNombre },
            ],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(2);
        expect(res.body.rechazados).toEqual([]);
    });

    it('fila con área y rol OPERADOR: crea la Sección dentro de la hacienda del supervisor y asigna al trabajador', async () => {
        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [{
                nombre_completo: 'Carlos Ruiz', codigo_megued: 'OP-001', rol: 'OPERADOR',
                supervisor: supervisorNombre, area: 'EMPACADORA',
            }],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(1);
        expect(res.body.rechazados).toEqual([]);

        const seccion = await Seccion.findOne({ where: { hacienda_id: haciendaId, nombre: 'EMPACADORA' } });
        expect(seccion).not.toBeNull();

        const operador = await Operador.findOne({ where: { codigo_megued: 'OP-001' } });
        expect(operador?.seccion_id).toBe(seccion?.id);
    });

    it('dos filas con la misma área y el mismo supervisor reusan la MISMA Sección (no duplican)', async () => {
        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [
                { nombre_completo: 'Carlos Ruiz', codigo_megued: 'OP-001', rol: 'OPERADOR', supervisor: supervisorNombre, area: 'EMPACADORA' },
                { nombre_completo: 'Ana Vera', codigo_megued: 'OP-002', rol: 'OPERADOR', supervisor: supervisorNombre, area: 'EMPACADORA' },
            ],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(2);

        const secciones = await Seccion.findAll({ where: { hacienda_id: haciendaId, nombre: 'EMPACADORA' } });
        expect(secciones).toHaveLength(1);

        const op1 = await Operador.findOne({ where: { codigo_megued: 'OP-001' } });
        const op2 = await Operador.findOne({ where: { codigo_megued: 'OP-002' } });
        expect(op1?.seccion_id).toBe(secciones[0]!.id);
        expect(op2?.seccion_id).toBe(secciones[0]!.id);
    });

    it('reusa una Sección que YA existía de antes (creada por el Admin), no crea una segunda', async () => {
        const seccionExistente = await Seccion.create({ hacienda_id: haciendaId, nombre: 'EMPACADORA' });

        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [{ nombre_completo: 'Carlos Ruiz', codigo_megued: 'OP-001', rol: 'OPERADOR', supervisor: supervisorNombre, area: 'EMPACADORA' }],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(1);

        const secciones = await Seccion.findAll({ where: { hacienda_id: haciendaId, nombre: 'EMPACADORA' } });
        expect(secciones).toHaveLength(1);
        expect(secciones[0]!.id).toBe(seccionExistente.id);
    });

    it('rechaza una fila con área pero SIN supervisor (Jefe Inmediato) - no hay hacienda a la cual anclar', async () => {
        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [{ nombre_completo: 'Carlos Ruiz', codigo_megued: 'OP-001', rol: 'OPERADOR', area: 'EMPACADORA' }],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(0);
        expect(res.body.rechazados[0].motivo).toContain('Jefe Inmediato');

        const seccion = await Seccion.findOne({ where: { nombre: 'EMPACADORA' } });
        expect(seccion).toBeNull();
    });

    it('rechaza una fila con área pero rol MECANICO - el área es exclusiva de Operadores', async () => {
        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [{ nombre_completo: 'Juan Perez', codigo_megued: 'MEC-001', rol: 'MECANICO', supervisor: supervisorNombre, area: 'EMPACADORA' }],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(0);
        expect(res.body.rechazados[0].motivo).toContain('área solo aplica a Operadores');
    });

    it('rechaza una fila con área y SIN rol explícito (default MECANICO) - mismo motivo que rol MECANICO explícito', async () => {
        const res = await request(app).post('/api/asistencia/operadores/importar').set(headers()).send({
            items: [{ nombre_completo: 'Juan Perez', codigo_megued: 'MEC-001', supervisor: supervisorNombre, area: 'EMPACADORA' }],
        });

        expect(res.status).toBe(201);
        expect(res.body.creados).toBe(0);
        expect(res.body.rechazados[0].motivo).toContain('área solo aplica a Operadores');
    });
});
