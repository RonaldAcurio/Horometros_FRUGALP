import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

describe('GET /api/auditoria', () => {
    let tokenAdmin: string;
    let victimaId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const victima = await crearUsuarioDePrueba({ usuario: 'victima1', clave: 'claveprueba123', cargo: 'ASISTENTE' });
        victimaId = victima.id;
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('un ASISTENTE no puede ver el historial (exclusivo ADMIN)', async () => {
        const loginAsistente = await request(app).post('/api/auth/login').send({ usuario: 'victima1', clave: 'claveprueba123' });
        const res = await request(app).get('/api/auditoria').set('Authorization', `Bearer ${loginAsistente.body.token}`);
        expect(res.status).toBe(403);
    });

    it('registra el reseteo de clave y lo devuelve en el historial', async () => {
        await request(app)
            .put(`/api/usuarios/${victimaId}/clave`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ clave: 'clavenueva456' });

        const res = await request(app).get('/api/auditoria').set('Authorization', `Bearer ${tokenAdmin}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0].accion).toBe('RESETEAR_CLAVE_USUARIO');
        expect(res.body.data[0].objetivo_nombre).toContain('victima1');
        expect(res.body.data[0].actor.nombre_completo).toContain('admin1');
    });

    it('pagina correctamente con mas de 20 registros (limite fijo en 20)', async () => {
        for (let i = 0; i < 25; i++) {
            await request(app)
                .put(`/api/usuarios/${victimaId}/clave`)
                .set('Authorization', `Bearer ${tokenAdmin}`)
                .send({ clave: `clave-${i}-00000` });
        }

        const pagina1 = await request(app).get('/api/auditoria?pagina=1').set('Authorization', `Bearer ${tokenAdmin}`);
        expect(pagina1.body.data.length).toBe(20);
        expect(pagina1.body.total).toBe(25);
        expect(pagina1.body.totalPaginas).toBe(2);

        const pagina2 = await request(app).get('/api/auditoria?pagina=2').set('Authorization', `Bearer ${tokenAdmin}`);
        expect(pagina2.body.data.length).toBe(5);
    }, 20000);
});
