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
    let operadorAjenoRolOperadorId: number;

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

        // rol MECANICO (default) - sigue sin poder ser agregado por un Supervisor ajeno.
        const operadorAjeno = await Operador.create({
            nombre_completo: 'Operador Ajeno', codigo_megued: 'OP-AJENO', supervisor_id: supervisorAjeno.id,
        });
        operadorAjenoId = operadorAjeno.id;

        // rol OPERADOR (pedido del usuario, 2026-11-02: no usan la app todavia) - CUALQUIER Supervisor puede
        // agregarlo, sin importar de que Supervisor sea.
        const operadorAjenoRolOperador = await Operador.create({
            nombre_completo: 'Operador de Campo Ajeno', codigo_megued: 'OP-CAMPO-AJENO', rol: 'OPERADOR',
            supervisor_id: supervisorAjeno.id,
        });
        operadorAjenoRolOperadorId = operadorAjenoRolOperador.id;

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

    it('SUPERVISOR no puede agregar a un trabajador MECANICO que no es suyo', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorAjenoId });

        expect(res.status).toBe(403);
    });

    /*
    Excepcion para rol OPERADOR (pedido del usuario, 2026-11-02): no usan la app todavia, asi que no generan
    su propia marcacion - cualquier Supervisor puede necesitar registrarle un dia de trabajo (ej. vino a
    reparar su tractor en el taller de OTRO Supervisor).
    */
    it('SUPERVISOR SI puede agregar a un Operador (rol OPERADOR) aunque sea de OTRO Supervisor', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorAjenoRolOperadorId });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.operador_id).toBe(operadorAjenoRolOperadorId);
        expect(res.body.asistencia.estado).toBe('EN_JORNADA');
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

    /*
    "+ Agregar Usuario" en fechas pasadas (pedido del usuario, 2026-10-27): el Supervisor tambien necesita
    poder agregar a un trabajador que falto marcar un dia ANTERIOR, no solo hoy, mientras esa hacienda no haya
    cerrado ya esa jornada - y la hora de ingreso para un dia pasado la escribe el propio Supervisor a mano
    (no se inventa ninguna hora).
    */
    it('agrega a una fecha anterior con hora_ingreso manual - queda EN_JORNADA con esa fecha y esa hora exactas', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId, fecha: '2026-10-20', hora_ingreso: '2026-10-20T13:30:00.000Z' });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.fecha).toBe('2026-10-20');
        expect(res.body.asistencia.estado).toBe('EN_JORNADA');
        expect(new Date(res.body.asistencia.hora_ingreso).toISOString()).toBe('2026-10-20T13:30:00.000Z');
        expect(res.body.message).toContain('2026-10-20');
    });

    it('rechaza una fecha futura', async () => {
        const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId, fecha: manana });

        expect(res.status).toBe(400);
    });

    it('rechaza hora_ingreso invalida', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId, fecha: '2026-10-20', hora_ingreso: 'no-es-una-fecha' });

        expect(res.status).toBe(400);
    });

    it('rechaza una fecha anterior si esa hacienda YA cerro esa jornada puntual (no solo la de hoy)', async () => {
        await CierreJornada.create({
            hacienda_id: haciendaId,
            fecha: '2026-10-20',
            cerrado_por_usuario_id: supervisorId,
        });

        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId, fecha: '2026-10-20', hora_ingreso: '2026-10-20T13:00:00.000Z' });

        expect(res.status).toBe(403);
    });

    it('sin fecha ni hora_ingreso sigue agregando a HOY con la hora del clic, como antes', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenSupervisor}`)
            .send({ operador_id: operadorPropioId });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.fecha).toBe(obtenerFechaLocalEcuador());
        expect(res.body.message).toBe('Trabajador agregado a la lista de hoy.');
    });
});

describe('GET /api/asistencia/operadores (acotado para SUPERVISOR, opcional para ADMIN)', () => {
    let tokenSupervisor: string;
    let tokenAdmin: string;
    let supervisorId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const hacienda = await Hacienda.create({ nombre: 'Hacienda Propia' });
        const haciendaAjena = await Hacienda.create({ nombre: 'Hacienda Ajena' });

        const supervisor = await crearUsuarioDePrueba({
            usuario: 'supervisor1', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: hacienda.id,
        });
        supervisorId = supervisor.id;
        const supervisorAjeno = await crearUsuarioDePrueba({
            usuario: 'supervisorAjeno', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaAjena.id,
        });
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });

        await Operador.create({ nombre_completo: 'Operador Propio', codigo_megued: 'OP-PROPIO', supervisor_id: supervisor.id });
        await Operador.create({ nombre_completo: 'Operador Ajeno', codigo_megued: 'OP-AJENO', supervisor_id: supervisorAjeno.id });
        // rol OPERADOR, de OTRO supervisor - solo para los tests nuevos de rol=OPERADOR mas abajo.
        await Operador.create({
            nombre_completo: 'Campo Ajeno Operador', codigo_megued: 'OP-CAMPO-AJENO', rol: 'OPERADOR',
            supervisor_id: supervisorAjeno.id,
        });

        const login = await request(app).post('/api/auth/login').send({ usuario: 'supervisor1', clave: 'claveprueba123' });
        tokenSupervisor = login.body.token;
        const loginAdmin = await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' });
        tokenAdmin = loginAdmin.body.token;
    });

    it('un SUPERVISOR solo ve a sus propios trabajadores, nunca los de otra hacienda', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20')
            .set('Authorization', `Bearer ${tokenSupervisor}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Operador Propio');
    });

    it('un SUPERVISOR no puede saltarse su propio alcance mandando supervisor_id de otro', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20&supervisor_id=999999')
            .set('Authorization', `Bearer ${tokenSupervisor}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Operador Propio');
    });

    it('ADMIN sin supervisor_id ve el directorio completo (los 3 trabajadores)', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20')
            .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(3);
    });

    it('ADMIN con supervisor_id solo ve a los trabajadores de ESE supervisor', async () => {
        const res = await request(app)
            .get(`/api/asistencia/operadores?pagina=1&limite=20&supervisor_id=${supervisorId}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Operador Propio');
    });

    /*
    rol=OPERADOR (pedido del usuario, 2026-11-02): el buscador de "+ Agregar Usuario" deja de acotar por
    supervisor_id propio y en su lugar solo filtra por rol - para que cualquier Supervisor pueda agregarle un
    dia de trabajo a un Operador de OTRO Supervisor (no usan la app, no generan su propia marcacion).
    */
    it('SUPERVISOR con rol=OPERADOR ve Operadores de CUALQUIER Supervisor, ignorando su propio alcance', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20&rol=OPERADOR')
            .set('Authorization', `Bearer ${tokenSupervisor}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Campo Ajeno Operador');
    });

    it('SUPERVISOR sin rol=OPERADOR sigue acotado a su propia gente, como siempre', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20')
            .set('Authorization', `Bearer ${tokenSupervisor}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Operador Propio');
    });

    it('SUPERVISOR con rol=MECANICO sigue acotado a su propia gente (el parametro solo relaja para OPERADOR)', async () => {
        const res = await request(app)
            .get('/api/asistencia/operadores?pagina=1&limite=20&rol=MECANICO')
            .set('Authorization', `Bearer ${tokenSupervisor}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].nombre_completo).toBe('Operador Propio');
    });
});

/*
Trabajador "prestado" via "+ Agregar Usuario" (pedido del usuario, 2026-11-03, con capturas de produccion):
un Operador agregado desde el Panel de OTRO Supervisor pertenece POR COMPLETO, ese dia, a quien lo agrego -
no a su Supervisor "de casa". Mismo concepto ya usado por procesarMarcacion/admitirTrabajadorExterno
(hacienda_prestamo_id), ahora conectado tambien a este endpoint.
*/
describe('Trabajador "prestado" via "+ Agregar Usuario" (hacienda_prestamo_id)', () => {
    let tokenRaquel: string;
    let tokenCastulo: string;
    let tokenAdmin: string;
    let raquelId: number;
    let castuloId: number;
    let haciendaRaquelId: number;
    let haciendaCastuloId: number;
    let kevinId: number;
    let mecanicoDeCastuloId: number;

    beforeEach(async () => {
        await limpiarBaseDeDatosTest();

        const haciendaRaquel = await Hacienda.create({ nombre: 'Hacienda Raquel' });
        haciendaRaquelId = haciendaRaquel.id;
        const haciendaCastulo = await Hacienda.create({ nombre: 'Hacienda Castulo' });
        haciendaCastuloId = haciendaCastulo.id;

        const raquel = await crearUsuarioDePrueba({
            usuario: 'raquel', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaRaquelId,
        });
        raquelId = raquel.id;
        const castulo = await crearUsuarioDePrueba({
            usuario: 'castulo', clave: 'claveprueba123', cargo: 'SUPERVISOR', hacienda_id: haciendaCastuloId,
        });
        castuloId = castulo.id;
        await crearUsuarioDePrueba({ usuario: 'admin1', clave: 'claveprueba123', cargo: 'ADMIN' });

        // rol OPERADOR, "de casa" de Castulo - Raquel lo va a agregar desde SU propio Panel.
        const kevin = await Operador.create({
            nombre_completo: 'Kevin Josue Aguavil', codigo_megued: 'OP-KEVIN', rol: 'OPERADOR', supervisor_id: castuloId,
        });
        kevinId = kevin.id;

        const mecanicoDeCastulo = await Operador.create({
            nombre_completo: 'Mecanico De Castulo', codigo_megued: 'MEC-CASTULO', supervisor_id: castuloId,
        });
        mecanicoDeCastuloId = mecanicoDeCastulo.id;

        tokenRaquel = (await request(app).post('/api/auth/login').send({ usuario: 'raquel', clave: 'claveprueba123' })).body.token;
        tokenCastulo = (await request(app).post('/api/auth/login').send({ usuario: 'castulo', clave: 'claveprueba123' })).body.token;
        tokenAdmin = (await request(app).post('/api/auth/login').send({ usuario: 'admin1', clave: 'claveprueba123' })).body.token;
    });

    it('SUPERVISOR (Raquel) agrega a un Operador de OTRO Supervisor - la Asistencia queda con hacienda_prestamo_id = la de Raquel', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenRaquel}`)
            .send({ operador_id: kevinId });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.hacienda_prestamo_id).toBe(haciendaRaquelId);
    });

    it('ADMIN con supervisor_id=Raquel agrega al mismo Operador - mismo hacienda_prestamo_id', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ operador_id: kevinId, supervisor_id: raquelId });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.hacienda_prestamo_id).toBe(haciendaRaquelId);
    });

    it('un SUPERVISOR que agrega a SU PROPIO trabajador no genera prestamo - hacienda_prestamo_id queda null', async () => {
        const res = await request(app)
            .post('/api/asistencia/agregar-manual')
            .set('Authorization', `Bearer ${tokenCastulo}`)
            .send({ operador_id: mecanicoDeCastuloId });

        expect(res.status).toBe(201);
        expect(res.body.asistencia.hacienda_prestamo_id).toBeNull();
    });

    it('obtenerAsistenciaHoy: Raquel (quien lo agrego) SI lo ve; Castulo (su Supervisor de casa) NO lo ve ese dia', async () => {
        await request(app).post('/api/asistencia/agregar-manual').set('Authorization', `Bearer ${tokenRaquel}`).send({ operador_id: kevinId });

        const comoRaquel = await request(app).get('/api/asistencia/hoy').set('Authorization', `Bearer ${tokenRaquel}`);
        expect(comoRaquel.status).toBe(200);
        expect(comoRaquel.body.data.some((a: { operador_id: number }) => a.operador_id === kevinId)).toBe(true);

        const comoCastulo = await request(app).get('/api/asistencia/hoy').set('Authorization', `Bearer ${tokenCastulo}`);
        expect(comoCastulo.status).toBe(200);
        expect(comoCastulo.body.data.some((a: { operador_id: number }) => a.operador_id === kevinId)).toBe(false);
    });

    it('finalizarDia: Castulo cierra su jornada SIN que el prestamo de Kevin lo bloquee (ya no es suyo ese dia)', async () => {
        await request(app).post('/api/asistencia/agregar-manual').set('Authorization', `Bearer ${tokenRaquel}`).send({ operador_id: kevinId });
        const altaCastulo = await request(app).post('/api/asistencia/agregar-manual').set('Authorization', `Bearer ${tokenCastulo}`).send({ operador_id: mecanicoDeCastuloId });
        await request(app).put(`/api/asistencia/${altaCastulo.body.asistencia.id}/confirmar`).set('Authorization', `Bearer ${tokenCastulo}`).send({ presente: true });

        const res = await request(app).post('/api/asistencia/finalizar-dia').set('Authorization', `Bearer ${tokenCastulo}`).send({});

        expect(res.status).toBe(200);
        const kevinFinal = await Asistencia.findOne({ where: { operador_id: kevinId } });
        // Sigue EN_JORNADA: el cierre de Castulo no lo toco - ya no esta en su alcance.
        expect(kevinFinal?.estado).toBe('EN_JORNADA');
    });

    it('finalizarDia: Raquel queda bloqueada por "Falta confirmar" de Kevin hasta confirmarlo, y su cierre SI lo transiciona', async () => {
        const alta = await request(app).post('/api/asistencia/agregar-manual').set('Authorization', `Bearer ${tokenRaquel}`).send({ operador_id: kevinId });

        const bloqueado = await request(app).post('/api/asistencia/finalizar-dia').set('Authorization', `Bearer ${tokenRaquel}`).send({});
        expect(bloqueado.status).toBe(400);
        expect(bloqueado.body.message).toContain('Kevin Josue Aguavil');

        await request(app).put(`/api/asistencia/${alta.body.asistencia.id}/confirmar`).set('Authorization', `Bearer ${tokenRaquel}`).send({ presente: true });

        const res = await request(app).post('/api/asistencia/finalizar-dia').set('Authorization', `Bearer ${tokenRaquel}`).send({});
        expect(res.status).toBe(200);
        const kevinFinal = await Asistencia.findByPk(alta.body.asistencia.id);
        expect(kevinFinal?.estado).toBe('SALIDA_OLVIDADA');
    });

    /*
    incluir_propios_prestados (pedido del usuario, 2026-11-03): el roster "Trabajadores que aun no marcan"
    (cargarTrabajadoresSinMarcar en el frontend) necesita lo CONTRARIO del alcance exclusivo de arriba - Kevin
    ya tiene Asistencia (prestado a Raquel), asi que NO debe seguir contando como "pendiente" para Castulo.
    */
    it('incluir_propios_prestados=true SI cuenta a Kevin para Castulo, aunque este prestado a Raquel', async () => {
        await request(app).post('/api/asistencia/agregar-manual').set('Authorization', `Bearer ${tokenRaquel}`).send({ operador_id: kevinId });

        const sinBandera = await request(app).get('/api/asistencia/hoy').set('Authorization', `Bearer ${tokenCastulo}`);
        expect(sinBandera.body.data.some((a: { operador_id: number }) => a.operador_id === kevinId)).toBe(false);

        const conBandera = await request(app).get('/api/asistencia/hoy?incluir_propios_prestados=true').set('Authorization', `Bearer ${tokenCastulo}`);
        expect(conBandera.body.data.some((a: { operador_id: number }) => a.operador_id === kevinId)).toBe(true);
    });
});

afterAll(async () => {
    await sequelize.close();
});
