import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

describe('POST /api/auth/login + revocacion de sesion', () => {
    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('rechaza usuario o clave incorrectos', async () => {
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });

        const res = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveincorrecta' });
        expect(res.status).toBe(401);
    });

    it('login exitoso devuelve token + terminos_aceptados en el perfil', async () => {
        await crearUsuarioDePrueba({
            usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN', terminos_aceptados_en: null,
        });

        const res = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.perfil.terminos_aceptados).toBe(false);
    });

    /*
    Regresion del bug real encontrado a mano en la sesion que agrego revocacion de sesiones: un JWT emitido
    ANTES de un reseteo de clave debe dejar de funcionar de inmediato, sin esperar su expiracion natural (8h) -
    y un login hecho justo despues del reseteo (mismo segundo o no) tiene que seguir funcionando normal.
    */
    it('un JWT emitido antes de un reseteo de clave deja de funcionar; el login nuevo si funciona', async () => {
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        await crearUsuarioDePrueba({ usuario: 'victima1', clave: 'claveprueba123', cargo: 'ASISTENTE' });

        const loginAdmin = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        const loginVictima = await request(app).post('/api/auth/login').send({ usuario: 'victima1', clave: 'claveprueba123' });
        const tokenAdmin = loginAdmin.body.token;
        const tokenViejo = loginVictima.body.token;

        /*
        sesionFueInvalidada compara por SEGUNDOS, no milisegundos (ver utils/sesion-revocada.ts - es la
        contrapartida aceptada del bug real que se encontro y corrigio con ese mismo cambio). Supertest contra
        una app en el mismo proceso es tan rapido que el login de arriba y el reseteo de abajo pueden caer en
        el MISMO segundo de reloj sin este delay, y el test fallaria por esa resolucion de 1s, no por un bug
        real - se fuerza a que caigan en segundos distintos, igual que se verifico a mano con curl.
        */
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const antes = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${tokenAdmin}`);
        expect(antes.status).toBe(200);
        const victimaId = antes.body.find((u: any) => u.usuario === 'victima1').id;

        const reset = await request(app)
            .put(`/api/usuarios/${victimaId}/clave`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ clave: 'clavenueva456' });
        expect(reset.status).toBe(200);

        const despues = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${tokenViejo}`);
        expect(despues.status).toBe(401);

        const loginNuevo = await request(app).post('/api/auth/login').send({ usuario: 'victima1', clave: 'clavenueva456' });
        expect(loginNuevo.status).toBe(200);

        const conTokenNuevo = await request(app)
            .get('/api/usuarios')
            .set('Authorization', `Bearer ${loginNuevo.body.token}`);
        expect(conTokenNuevo.status).toBe(200);
    });
});
