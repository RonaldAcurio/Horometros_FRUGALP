import bcrypt from 'bcryptjs';
import { sequelize } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { RegistroAuditoria } from '../models/registro_auditoria';
import { limpiarBaseDeDatosTest, crearUsuarioDePrueba } from './helpers';

/*
Siembra la BD de TEST con un volumen parecido al real (ver CLAUDE.md, "Pruebas de carga"): ~950 Operadores es el
numero de trabajadores de campo que va a tener la empresa cliente. Sin esto, las pruebas de carga mandarian
peticiones contra una tabla de 3 filas y no dirian nada sobre como se comporta la app con el volumen real.

Contrasena compartida por los 950 Operadores a proposito (CLAVE_CARGA_OPERADOR mas abajo): bcrypt hashea a
~60-80ms por llamada, hashear 950 claves DISTINTAS haria que sembrar tome mas de un minuto sin aportar nada
a la prueba (no se esta probando el login, se esta probando marcar-codigo bajo carga). Datos 100% sinteticos,
nunca contra development/produccion (ver database.ts, NODE_ENV=test).
*/
export const CANTIDAD_OPERADORES_CARGA = 950;
export const CLAVE_CARGA_OPERADOR = 'CargaPrueba123';
export const ADMIN_CARGA = { usuario: 'carga_admin', clave: 'CargaAdmin123', cargo: 'ADMIN' as const };
export const HACIENDA_CARGA_NOMBRE = 'Hacienda Carga';
/*
Pool APARTE para la rafaga de marcar-codigo (ver mas abajo): un Operador solo puede marcar UNA vez por dia
(procesarMarcacion en asistencia.controller.ts rechaza con 400 "ya completo su jornada laboral de hoy" si ya
tiene una Asistencia de hoy, sea EN_JORNADA o FINALIZADO) - no se puede reusar el pool de arriba (que YA tiene
una Asistencia de hoy sembrada, a proposito, para la prueba de lectura de /asistencia/hoy) para simular tambien
un arranque de turno fresco: serian 950 rechazos por regla de negocio real, no falta de capacidad del server.
*/
export const CANTIDAD_OPERADORES_RAFAGA = 950;
export const PREFIJO_USUARIO_RAFAGA = 'carga_burst_';

const sembrar = async (): Promise<void> => {
    await limpiarBaseDeDatosTest();

    const admin = await crearUsuarioDePrueba({
        ...ADMIN_CARGA,
        nombre_completo: 'Admin Prueba de Carga',
        terminos_aceptados_en: new Date(),
    });

    // Token de Hacienda vigente por 24h (ver utils/token-hacienda.ts) - marcar-codigo lo exige en cada llamada.
    const hacienda = await Hacienda.create({
        nombre: HACIENDA_CARGA_NOMBRE,
        token_actual: 'token-carga-' + Date.now(),
        token_expira_en: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const claveHashCompartida = await bcrypt.hash(CLAVE_CARGA_OPERADOR, 10);
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guayaquil' });

    console.log(`Sembrando ${CANTIDAD_OPERADORES_CARGA} operadores...`);
    const operadoresData = Array.from({ length: CANTIDAD_OPERADORES_CARGA }, (_, i) => {
        const n = String(i + 1).padStart(4, '0');
        return {
            codigo_megued: `CARGA-${n}`,
            nombre_completo: `Operador Carga ${n}`,
            cedula: `9${n}${String(i).padStart(5, '0')}`.slice(0, 10),
            telefono: `09${n}${String(i).padStart(6, '0')}`.slice(0, 10),
            direccion: `Sector de prueba ${n}, Santo Domingo`,
            usuario: `carga_op_${n}`,
            clave_hash: claveHashCompartida,
            rol: (i % 5 === 0 ? 'MECANICO' : 'OPERADOR') as 'MECANICO' | 'OPERADOR',
            terminos_aceptados_en: new Date(),
        };
    });
    // bulkCreate SI corre los setters de campo (get/set en el modelo, ver operador.ts): construye cada instancia
    // con build() antes del INSERT masivo, asi que cedula/telefono/direccion salen cifrados igual que con create().
    const operadores = await Operador.bulkCreate(operadoresData);

    /*
    ~950 filas de Asistencia con fecha=HOY (una por Operador), YA CERRADAS (FINALIZADO, con hora_salida) - simula
    el peor caso real para el Panel de Supervisor (GET /asistencia/hoy): que TODOS hayan marcado ya en el dia.
    A proposito NO se dejan en EN_JORNADA: la rafaga de marcar-codigo de mas abajo usa estos MISMOS 950
    operadores para simular el arranque del turno SIGUIENTE, y procesarMarcacion trata a quien ya tiene una
    jornada abierta como una SALIDA (exige actividades_ids) - con EN_JORNADA aca, la rafaga completa fallaria
    con 400 "falta seleccionar actividad", no por falta de capacidad real. No se llama al endpoint para esto
    (seria carga de escritura real, no siembra) - se inserta directo por Sequelize.
    */
    console.log('Sembrando asistencias de hoy...');
    await Asistencia.bulkCreate(
        operadores.map((op) => {
            const horaIngreso = new Date();
            horaIngreso.setHours(7, 0, 0, 0);
            const horaSalida = new Date();
            horaSalida.setHours(16, 0, 0, 0);
            return {
                operador_id: op.id,
                fecha: hoy,
                hora_ingreso: horaIngreso,
                hora_salida: horaSalida,
                estado: 'FINALIZADO' as const,
            };
        })
    );

    console.log(`Sembrando ${CANTIDAD_OPERADORES_RAFAGA} operadores para la rafaga de marcar-codigo...`);
    const operadoresRafagaData = Array.from({ length: CANTIDAD_OPERADORES_RAFAGA }, (_, i) => {
        const n = String(i + 1).padStart(4, '0');
        return {
            codigo_megued: `CARGB-${n}`,
            nombre_completo: `Operador Rafaga ${n}`,
            cedula: `8${n}${String(i).padStart(5, '0')}`.slice(0, 10),
            telefono: `08${n}${String(i).padStart(6, '0')}`.slice(0, 10),
            direccion: `Sector de prueba ${n}, Santo Domingo`,
            usuario: `${PREFIJO_USUARIO_RAFAGA}${n}`,
            clave_hash: claveHashCompartida,
            rol: (i % 5 === 0 ? 'MECANICO' : 'OPERADOR') as 'MECANICO' | 'OPERADOR',
            terminos_aceptados_en: new Date(),
        };
    });
    // Sin Asistencia de hoy: son exactamente los que la rafaga de abajo va a usar para marcar ENTRADA por primera vez.
    await Operador.bulkCreate(operadoresRafagaData);

    /*
    ~3000 registros de auditoria repartidos en los ultimos 180 dias: simula meses de reseteos de clave/tokens de
    Hacienda acumulados, para que la prueba de carga del Historial (GET /auditoria) pagine sobre volumen real y
    no sobre una tabla vacia.
    */
    console.log('Sembrando historial de auditoria...');
    const accionesAuditoria = ['RESETEAR_CLAVE_OPERADOR', 'RESETEAR_CLAVE_USUARIO', 'GENERAR_TOKEN_HACIENDA'] as const;
    const registrosAuditoria = Array.from({ length: 3000 }, (_, i) => {
        const diasAtras = Math.floor(Math.random() * 180);
        const fecha = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
        return {
            actor_usuario_id: admin.id,
            accion: accionesAuditoria[i % accionesAuditoria.length]!,
            objetivo_tipo: 'operador' as const,
            objetivo_id: operadores[i % operadores.length]!.id,
            objetivo_nombre: `Operador Carga ${String((i % CANTIDAD_OPERADORES_CARGA) + 1).padStart(4, '0')}`,
            createdAt: fecha,
            updatedAt: fecha,
        };
    });
    await RegistroAuditoria.bulkCreate(registrosAuditoria);

    console.log(
        `Sembrado listo: ${CANTIDAD_OPERADORES_CARGA} operadores con asistencia de hoy ya cerrada, ` +
        `${CANTIDAD_OPERADORES_RAFAGA} operadores frescos para la rafaga, 3000 registros de auditoria, ` +
        `Hacienda "${HACIENDA_CARGA_NOMBRE}" (token vigente 24h), ADMIN "${ADMIN_CARGA.usuario}".`
    );
    await sequelize.close();
};

/*
Solo se auto-ejecuta cuando este archivo se corre directamente (npm run carga:preparar) - prueba-carga.ts
importa las constantes de arriba (CANTIDAD_OPERADORES_CARGA, etc.) para no duplicarlas, y sin este guard esa
sola importacion volveria a llamar a sembrar() (que empieza con limpiarBaseDeDatosTest()) en paralelo con la
prueba de carga ya corriendo - se piso a si misma y de ahi salian errores 500 por operadores borrados a mitad
de las peticiones, no un problema real de capacidad.
*/
if (require.main === module) {
    sembrar().catch((err) => {
        console.error('Error al sembrar datos de carga:', err);
        process.exit(1);
    });
}
