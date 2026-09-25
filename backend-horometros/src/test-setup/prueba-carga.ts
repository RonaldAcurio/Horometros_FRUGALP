import autocannon from 'autocannon';
import { Op } from 'sequelize';
import { sequelize, conectarBD } from '../config/database';
import { Hacienda } from '../models/hacienda';
import { Operador } from '../models/operador';
import app from '../app';
import {
    CANTIDAD_OPERADORES_CARGA,
    CANTIDAD_OPERADORES_RAFAGA,
    PREFIJO_USUARIO_RAFAGA,
    CLAVE_CARGA_OPERADOR,
    ADMIN_CARGA,
    HACIENDA_CARGA_NOMBRE,
} from './sembrar-carga';

/*
Prueba de carga real (ver CLAUDE.md, "Pruebas de carga"): contra un backend real, arrancado en este mismo
proceso, y la BD de TEST ya sembrada con volumen realista (ver 'npm run carga:preparar', que hay que correr
ANTES de esto). No mide "cuantos requests por segundo aguanta Express" en el vacio - mide lo que de verdad
importa: como responde este backend, CON este pool de Postgres (max:10, ver config/database.ts) y ESTAS
queries, al volumen que va a tener la empresa cliente (~950 trabajadores de campo + un puñado de oficina).
*/

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = `http://localhost:${PORT}`;

interface ResultadoEndpoint {
    nombre: string;
    conexiones: number;
    duracionSeg: number;
    totalRequests: number;
    porSegundoPromedio: number;
    latenciaP50: number;
    latenciaP97_5: number;
    latenciaP99: number;
    errores: number;
    no2xx: number;
}

const correrAutocannon = async (
    nombre: string,
    opts: autocannon.Options,
    conexiones: number,
    duracionSeg: number
): Promise<ResultadoEndpoint> => {
    const resultado = await autocannon({ ...opts, connections: conexiones, duration: duracionSeg });
    return {
        nombre,
        conexiones,
        duracionSeg,
        totalRequests: resultado.requests.total,
        porSegundoPromedio: resultado.requests.average,
        latenciaP50: resultado.latency.p50,
        latenciaP97_5: resultado.latency.p97_5,
        latenciaP99: resultado.latency.p99,
        errores: resultado.errors,
        no2xx: resultado.non2xx,
    };
};

const imprimirResultado = (r: ResultadoEndpoint): void => {
    console.log(
        `\n${r.nombre}\n` +
        `  ${r.conexiones} conexiones concurrentes, ${r.duracionSeg}s -> ${r.totalRequests} requests ` +
        `(${r.porSegundoPromedio.toFixed(1)}/seg promedio)\n` +
        `  Latencia: p50=${r.latenciaP50}ms  p97.5=${r.latenciaP97_5}ms  p99=${r.latenciaP99}ms\n` +
        `  Errores de conexion: ${r.errores}  |  Respuestas no-2xx: ${r.no2xx}`
    );
};

/*
Rafaga de marcar-codigo simulando el arranque de turno: ~950 trabajadores, cada uno marca UNA vez, con SU
PROPIO usuario (no el mismo operador repetido - eso mediria una race condition interna, no capacidad real).
autocannon no da control fino sobre un body distinto por request sin su API de bajo nivel, asi que esto usa
un pool de promesas propio (concurrencia fija, igual que Promise.all limitado) - mas simple y mas fiel a lo
que se quiere medir.
*/
const rafagaMarcarCodigo = async (
    tokenHacienda: string,
    usuarios: string[],
    concurrencia: number
): Promise<ResultadoEndpoint> => {
    const latencias: number[] = [];
    let errores = 0;
    let no2xx = 0;
    const inicio = Date.now();

    let siguiente = 0;
    const trabajador = async (): Promise<void> => {
        while (siguiente < usuarios.length) {
            const idx = siguiente++;
            const usuario = usuarios[idx]!;
            const t0 = Date.now();
            try {
                const res = await fetch(`${BASE_URL}/api/asistencia/marcar-codigo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usuario, clave: CLAVE_CARGA_OPERADOR, token_hacienda: tokenHacienda }),
                });
                latencias.push(Date.now() - t0);
                if (!res.ok) no2xx++;
            } catch {
                errores++;
            }
        }
    };
    await Promise.all(Array.from({ length: concurrencia }, () => trabajador()));

    const duracionSeg = (Date.now() - inicio) / 1000;
    latencias.sort((a, b) => a - b);
    const percentil = (p: number): number => latencias[Math.min(latencias.length - 1, Math.floor(latencias.length * p))] ?? 0;

    return {
        nombre: 'POST /api/asistencia/marcar-codigo (una marcacion por trabajador, arranque de turno)',
        conexiones: concurrencia,
        duracionSeg,
        totalRequests: usuarios.length,
        porSegundoPromedio: usuarios.length / duracionSeg,
        latenciaP50: percentil(0.5),
        latenciaP97_5: percentil(0.975),
        latenciaP99: percentil(0.99),
        errores,
        no2xx,
    };
};

const main = async (): Promise<void> => {
    await conectarBD();

    const hacienda = await Hacienda.findOne({ where: { nombre: HACIENDA_CARGA_NOMBRE } });
    const totalOperadores = await Operador.count();
    const operadoresRafaga = await Operador.findAll({
        attributes: ['usuario'],
        where: { usuario: { [Op.like]: `${PREFIJO_USUARIO_RAFAGA}%` } },
        limit: CANTIDAD_OPERADORES_RAFAGA,
    });
    if (!hacienda || totalOperadores < CANTIDAD_OPERADORES_CARGA || operadoresRafaga.length < CANTIDAD_OPERADORES_RAFAGA) {
        console.error(
            'La BD de TEST no esta sembrada para la prueba de carga. Corre primero "npm run carga:preparar".'
        );
        process.exit(1);
    }
    const usuariosRafaga = operadoresRafaga.map((o) => o.usuario!).filter(Boolean);

    const servidor = app.listen(PORT);
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    console.log(`Servidor de prueba de carga escuchando en ${BASE_URL} (NODE_ENV=${process.env.NODE_ENV})\n`);

    try {
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: ADMIN_CARGA.usuario, clave: ADMIN_CARGA.clave }),
        });
        const { token } = (await loginRes.json()) as { token: string };
        const headersAuth = { Authorization: `Bearer ${token}` };

        console.log('=== Pruebas de lectura (dashboards de oficina, concurrencia realista ~20) ===');

        imprimirResultado(
            await correrAutocannon(
                `GET /api/asistencia/operadores  (${totalOperadores} operadores, SIN paginar)`,
                { url: `${BASE_URL}/api/asistencia/operadores`, headers: headersAuth },
                20,
                10
            )
        );

        imprimirResultado(
            await correrAutocannon(
                'GET /api/auditoria?pagina=1  (3000 registros, paginado)',
                { url: `${BASE_URL}/api/auditoria?pagina=1`, headers: headersAuth },
                20,
                10
            )
        );

        imprimirResultado(
            await correrAutocannon(
                `GET /api/asistencia/hoy?pagina=1  (${CANTIDAD_OPERADORES_CARGA} asistencias hoy, paginado)`,
                { url: `${BASE_URL}/api/asistencia/hoy?pagina=1`, headers: headersAuth },
                20,
                10
            )
        );

        console.log('\n=== Rafaga de arranque de turno (escritura, ~950 marcaciones distintas) ===');
        imprimirResultado(await rafagaMarcarCodigo(hacienda.token_actual!, usuariosRafaga, 50));
    } finally {
        await new Promise<void>((resolve) => servidor.close(() => resolve()));
        await sequelize.close();
    }
};

main().catch((err) => {
    console.error('Error en la prueba de carga:', err);
    process.exit(1);
});
