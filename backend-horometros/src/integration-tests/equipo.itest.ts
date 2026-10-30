import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

/*
Pedido del usuario, 2026-10-30: re-subió una lista de 280 equipos que YA estaban cargados y "salieron
repitiendo todos". Causa real: codigo_megued/nombre_equipo eran UNIQUE exactos (case-sensitive) en Postgres,
así que "EQ-001" y "eq-001" se trataban como valores distintos - ni crearEquipo ni importarEquipos detectaban
la colisión contra lo que ya existía con otra combinación de mayúsculas/minúsculas. El usuario además decidió
que de ahora en adelante SOLO el código tiene que ser único - el nombre ya no (ver migración
'20261030180000-equipos-unico-solo-por-codigo-sin-mayus.js' y equipo.controller.ts).
*/
describe('Equipos: unicidad SOLO por código, sin importar mayúsculas/minúsculas', () => {
    let token: string;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        token = login.body.token;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    const headers = () => ({ Authorization: `Bearer ${token}` });

    describe('POST /api/equipos (uno por uno)', () => {
        it('crea un equipo nuevo sin problema', async () => {
            const res = await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor A' });
            expect(res.status).toBe(201);
            expect(res.body.codigo_megued).toBe('EQ-001');
        });

        it('rechaza el mismo código exacto', async () => {
            await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor A' });
            const res = await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor B' });
            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Ya existe un equipo con ese código.');
        });

        it('rechaza el mismo código con distintas mayúsculas/minúsculas (bug real reportado)', async () => {
            await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor A' });
            const res = await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'eq-001', nombre_equipo: 'Tractor B' });
            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Ya existe un equipo con ese código.');
        });

        it('YA NO rechaza un nombre repetido si el código es distinto (pedido del usuario: solo el código importa)', async () => {
            await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor A' });
            const res = await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-002', nombre_equipo: 'Tractor A' });
            expect(res.status).toBe(201);
            expect(res.body.nombre_equipo).toBe('Tractor A');
        });
    });

    describe('POST /api/equipos/importar (plantilla masiva)', () => {
        it('crea todo lo que no choca y reporta solo lo que choca', async () => {
            const res = await request(app).post('/api/equipos/importar').set(headers()).send({
                items: [
                    { codigo_megued: 'EQ-100', nombre_equipo: 'Grúa 1' },
                    { codigo_megued: 'EQ-101', nombre_equipo: 'Grúa 2' },
                ],
            });
            expect(res.status).toBe(201);
            expect(res.body.creados).toBe(2);
            expect(res.body.rechazados).toEqual([]);
        });

        it('rechaza un código repetido DENTRO del mismo archivo, aunque cambie de mayúsculas/minúsculas', async () => {
            const res = await request(app).post('/api/equipos/importar').set(headers()).send({
                items: [
                    { codigo_megued: 'EQ-200', nombre_equipo: 'Bomba A' },
                    { codigo_megued: 'eq-200', nombre_equipo: 'Bomba B' },
                ],
            });
            expect(res.status).toBe(201);
            expect(res.body.creados).toBe(1);
            expect(res.body.rechazados).toEqual([{ fila: 3, motivo: 'El código "eq-200" está repetido dentro del archivo.' }]);
        });

        it('rechaza un código que ya existía en la base, aunque venga con otras mayúsculas/minúsculas (bug real reportado: re-subir la misma lista)', async () => {
            await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor A' });
            const res = await request(app).post('/api/equipos/importar').set(headers()).send({
                items: [{ codigo_megued: 'eq-001', nombre_equipo: 'Tractor A (reimportado)' }],
            });
            expect(res.status).toBe(201);
            expect(res.body.creados).toBe(0);
            expect(res.body.rechazados).toEqual([{ fila: 2, motivo: 'ya existe un equipo con el código "eq-001".' }]);
        });

        it('YA NO rechaza nombres repetidos entre filas del archivo (solo el código importa)', async () => {
            const res = await request(app).post('/api/equipos/importar').set(headers()).send({
                items: [
                    { codigo_megued: 'EQ-300', nombre_equipo: 'Excavadora' },
                    { codigo_megued: 'EQ-301', nombre_equipo: 'Excavadora' },
                ],
            });
            expect(res.status).toBe(201);
            expect(res.body.creados).toBe(2);
            expect(res.body.rechazados).toEqual([]);
        });

        it('avisa si el código perteneció a un equipo eliminado antes', async () => {
            const creado = await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-400', nombre_equipo: 'Grúa vieja' });
            await request(app).delete(`/api/equipos/${creado.body.id}`).set(headers());
            const res = await request(app).post('/api/equipos/importar').set(headers()).send({
                items: [{ codigo_megued: 'eq-400', nombre_equipo: 'Grúa nueva' }],
            });
            expect(res.body.rechazados[0].motivo).toContain('perteneció a un equipo eliminado antes');
        });
    });

    describe('PUT /api/equipos/:id', () => {
        it('rechaza editar el código a uno que ya usa otro equipo, aunque cambie de mayúsculas/minúsculas', async () => {
            await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-001', nombre_equipo: 'Tractor A' });
            const otro = await request(app).post('/api/equipos').set(headers()).send({ codigo_megued: 'EQ-002', nombre_equipo: 'Tractor B' });

            const res = await request(app).put(`/api/equipos/${otro.body.id}`).set(headers()).send({ codigo_megued: 'eq-001' });
            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Ya existe un equipo con ese código.');
        });
    });
});
