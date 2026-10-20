import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

describe('Operador: cifrado de PII en reposo (cedula/telefono/direccion)', () => {
    let tokenAdmin: string;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;
    });

    it('crea un operador y la API devuelve la PII en texto plano', async () => {
        const res = await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({
                nombre_completo: 'Operador Integracion',
                codigo_megued: 'ITEST-001',
                cedula: '1712345678',
                telefono: '0991234567',
                direccion: 'Calle de prueba 123',
            });

        expect(res.status).toBe(201);
        expect(res.body.cedula).toBe('1712345678');
        expect(res.body.telefono).toBe('0991234567');
        expect(res.body.direccion).toBe('Calle de prueba 123');
    });

    it('la BD guarda cedula/telefono/direccion CIFRADOS, nunca en texto plano', async () => {
        const res = await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Operador Integracion', codigo_megued: 'ITEST-002', cedula: '1798765432' });

        const crudo: any = await sequelize.query('SELECT cedula FROM operadores WHERE id = :id', {
            replacements: { id: res.body.id },
            plain: true,
        });
        expect(crudo.cedula).not.toBe('1798765432');
        expect(crudo.cedula.startsWith('enc1:')).toBe(true);
    });

    it('rechaza una cedula duplicada con 409, sin exponer el texto cifrado en el mensaje', async () => {
        await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Operador Uno', codigo_megued: 'ITEST-003', cedula: '1711111111' });

        const res = await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Operador Dos', codigo_megued: 'ITEST-004', cedula: '1711111111' });

        expect(res.status).toBe(409);
        expect(res.body.message).toContain('Operador Uno');
        expect(res.body.message).not.toContain('enc1:');
    });

    it('editar telefono/direccion de un operador existente responde en texto plano', async () => {
        const creado = await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Operador Editar', codigo_megued: 'ITEST-005' });

        const editado = await request(app)
            .put(`/api/asistencia/operadores/${creado.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ telefono: '0987000000', direccion: 'Nueva direccion 456' });

        expect(editado.status).toBe(200);
        expect(editado.body.operador.telefono).toBe('0987000000');
        expect(editado.body.operador.direccion).toBe('Nueva direccion 456');
    });
});

/*
Boton de lapiz en la Ficha (pedido del usuario, 2026-10-20): antes actualizarOperador ignoraba por
completo nombre_completo, aunque se lo mandaran - estas pruebas cubren que ahora si lo guarda, con
las mismas validaciones de largo/no-vacio que ya tenia crearOperador.
*/
describe('PUT /api/asistencia/operadores/:id (editar nombre_completo)', () => {
    let tokenAdmin: string;
    let operadorId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;

        const creado = await request(app)
            .post('/api/asistencia/operadores')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Nombre Original', codigo_megued: 'ITEST-NOMBRE' });
        operadorId = creado.body.id;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('cambia el nombre_completo cuando se manda', async () => {
        const res = await request(app)
            .put(`/api/asistencia/operadores/${operadorId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'Nombre Corregido' });

        expect(res.status).toBe(200);
        expect(res.body.operador.nombre_completo).toBe('Nombre Corregido');
    });

    it('no toca el nombre_completo cuando no se manda (sigue el original)', async () => {
        const res = await request(app)
            .put(`/api/asistencia/operadores/${operadorId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ telefono: '0991112222' });

        expect(res.status).toBe(200);
        expect(res.body.operador.nombre_completo).toBe('Nombre Original');
    });

    it('rechaza un nombre_completo vacio (o solo espacios)', async () => {
        const res = await request(app)
            .put(`/api/asistencia/operadores/${operadorId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: '   ' });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('vacío');
    });

    it('rechaza un nombre_completo de mas de 150 caracteres', async () => {
        const res = await request(app)
            .put(`/api/asistencia/operadores/${operadorId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: 'A'.repeat(151) });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('150 caracteres');
    });

    it('recorta espacios al inicio/final antes de guardar', async () => {
        const res = await request(app)
            .put(`/api/asistencia/operadores/${operadorId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nombre_completo: '  Nombre Con Espacios  ' });

        expect(res.status).toBe(200);
        expect(res.body.operador.nombre_completo).toBe('Nombre Con Espacios');
    });
});
