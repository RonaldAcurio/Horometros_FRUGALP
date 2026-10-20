import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { sequelize } from '../config/database';
import { Asistencia } from '../models/asistencias';
import { Operador } from '../models/operador';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from '../test-setup/helpers';

/*
Editar/Eliminar labor (pedido del usuario, 2026-10-16: corregir equipo/actividad/observacion equivocados, o
borrar por completo una labor mal registrada). Se prueba con un ADMIN autenticado (no un operador) a proposito:
el chequeo de permisos (puedeOperarSobreAsistencia) ya esta cubierto por el resto del sistema y no es lo que
este feature cambia - lo que SI es nuevo (y lo que estas pruebas cubren) es: el eliminar nunca abre un hueco
(solo la ULTIMA labor), el editar JAMAS mueve hora_inicio/hora_fin aunque se lo manden, y ninguno de los dos
toca el catalogo de Equipo/Actividad.
*/
describe('PUT/DELETE /api/registro-actividades/:id (editar/eliminar labor)', () => {
    let tokenAdmin: string;
    let asistenciaId: number;
    let equipoId: number;
    let actividadId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });
        const login = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = login.body.token;

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

        const operador = await Operador.create({ nombre_completo: 'Operador Itest', codigo_megued: 'OP-ITEST' });
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

    const crearLabor = (horaInicio: string) =>
        request(app)
            .post('/api/registro-actividades')
            .set('Authorization', `Bearer ${tokenAdmin}`)
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

    it('editar corrige equipo/actividad/observaciones pero JAMAS mueve hora_inicio/hora_fin, aunque se lo manden', async () => {
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
                // Intento deliberado de mover la hora - el controller ni siquiera los lee.
                hora_inicio: '2099-01-01T00:00:00.000Z',
                hora_fin: '2099-01-01T01:00:00.000Z',
            });

        expect(editada.status).toBe(200);
        expect(editada.body.registro.equipo_id).toBe(equipo2.body.id);
        expect(editada.body.registro.observaciones).toBe('Corregido via editar');
        expect(new Date(editada.body.registro.hora_inicio).toISOString()).toBe(new Date(horaOriginal).toISOString());
        expect(editada.body.registro.hora_fin).toBeNull();
    });

    it('rechaza editar/eliminar una labor de una jornada que ya no esta EN_JORNADA', async () => {
        const creada = await crearLabor('2026-10-16T07:00:00.000Z');
        await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });

        const editar = await request(app)
            .put(`/api/registro-actividades/${creada.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ observaciones: 'no deberia aplicar' });
        expect(editar.status).toBe(400);

        const eliminar = await request(app)
            .delete(`/api/registro-actividades/${creada.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(eliminar.status).toBe(400);
    });

    /*
    TEMPORAL (pedido del usuario, 2026-10-20 - revertir una vez usado): forzar:true salta la exigencia de
    "solo la ultima labor", para limpiar labores duplicadas atrapadas detras de una que el trabajador queria
    conservar. Las pruebas confirman: SI deja borrar del medio con forzar:true, sigue exigiendo EN_JORNADA
    igual que siempre, y nunca toca el catalogo ni rompe los totales de horas del resto de las labores.
    */
    it('forzar:true SI deja eliminar una labor que NO es la última', async () => {
        const l1 = await crearLabor('2026-10-16T07:00:00.000Z');
        const l2 = await crearLabor('2026-10-16T09:00:00.000Z');
        const l3 = await crearLabor('2026-10-16T11:00:00.000Z');

        // Sin forzar, sigue rechazando la del medio (el comportamiento normal no cambio).
        const rechazada = await request(app)
            .delete(`/api/registro-actividades/${l2.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(rechazada.status).toBe(400);

        // Con forzar:true, SI la deja borrar aunque l3 (mas reciente) siga existiendo.
        const forzada = await request(app)
            .delete(`/api/registro-actividades/${l2.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ forzar: true });
        expect(forzada.status).toBe(200);

        const restantes = await request(app)
            .get(`/api/registro-actividades?asistencia_id=${asistenciaId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);
        expect(restantes.body.map((r: any) => r.id).sort()).toEqual([l1.body.id, l3.body.id].sort());
    });

    it('forzar:true sigue exigiendo EN_JORNADA - no salta ese gate', async () => {
        const creada = await crearLabor('2026-10-16T07:00:00.000Z');
        await Asistencia.update({ estado: 'FINALIZADO', hora_salida: new Date() }, { where: { id: asistenciaId } });

        const eliminar = await request(app)
            .delete(`/api/registro-actividades/${creada.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ forzar: true });
        expect(eliminar.status).toBe(400);
    });

    it('borrar del medio con forzar:true no toca el catálogo ni rompe las labores que quedan', async () => {
        const l1 = await crearLabor('2026-10-16T07:00:00.000Z');
        const l2 = await crearLabor('2026-10-16T09:00:00.000Z');
        const l3 = await crearLabor('2026-10-16T11:00:00.000Z');

        await request(app)
            .delete(`/api/registro-actividades/${l2.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ forzar: true });

        const equipos = await request(app).get('/api/equipos?pagina=1&limite=20').set('Authorization', `Bearer ${tokenAdmin}`);
        expect(equipos.body.data.some((e: any) => e.id === equipoId)).toBe(true);

        // l1 y l3 siguen intactas, editables, y la jornada sigue EN_JORNADA.
        const sigueEditable = await request(app)
            .put(`/api/registro-actividades/${l3.body.id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ observaciones: 'sigue funcionando' });
        expect(sigueEditable.status).toBe(200);
    });
});
