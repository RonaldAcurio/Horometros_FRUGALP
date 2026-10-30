import { Request, Response } from 'express';
import { Op, where, fn, col } from 'sequelize';
import { Equipo } from '../models';

/*
Catalogo de Equipos (maquinaria): lo lee el selector del Panel de Actividades (MECANICO/OPERADOR eligen sobre
que equipo trabajaron) y la pestaña "Equipo" del Panel de Asistente (gestion: crear/editar/eliminar, ver abajo).
Ambos comparten el mismo modelo `Equipo` que el modulo Horometros usa para sus lecturas OCR (`ultimo_km_inicial`/
`ultimo_real`/`numero_hoja`/`tiene_tope_10k`) - esos campos horometros-especificos no se tocan ni se piden aqui.
Paginado (mismo patron que `obtenerAsistenciaHoy`) porque el catalogo puede crecer. `q` opcional filtra por
codigo_megued/nombre_equipo - lo usa el buscador de la pestaña de gestion.
Sin 'pagina'/'limite' en la query devuelve el arreglo completo (mismo patron que `ObtenerActividades`) - lo usa
el cacheo local offline-first del Panel de Actividades (ver OfflineSyncService en el frontend), que necesita
bajar el catalogo entero una sola vez para poder buscar despues sin señal.
*/
export const obtenerEquipos = async(req: Request, res: Response): Promise<void> => {
    try {
        const { pagina: paginaQuery, limite: limiteQuery } = req.query;

        if (paginaQuery === undefined && limiteQuery === undefined) {
            const equipos = await Equipo.findAll({
                attributes: ['id', 'codigo_megued', 'nombre_equipo'],
                order: [['nombre_equipo', 'ASC']],
            });
            res.json(equipos);
            return;
        }

        const pagina = Math.max(1, Number(paginaQuery) || 1);
        const limite = Math.min(100, Math.max(1, Number(limiteQuery) || 20));
        const offset = (pagina - 1) * limite;
        const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';

        const where = q ? {
            [Op.or]: [
                { codigo_megued: { [Op.iLike]: `%${q}%` } },
                { nombre_equipo: { [Op.iLike]: `%${q}%` } },
            ],
        } : {};

        const { rows: equipos, count: total } = await Equipo.findAndCountAll({
            where,
            attributes: ['id', 'codigo_megued', 'nombre_equipo'],
            order: [['nombre_equipo', 'ASC']],
            limit: limite,
            offset,
        });
        res.json({ data: equipos, total, pagina, totalPaginas: Math.ceil(total / limite) || 1 });
    } catch (err) {
        console.error('Error al obtener los equipos.', err);
        res.status(500).json({ message: 'Error al obtener los equipos.' });
    }
};

// Crear un nuevo Equipo - misma pestaña de gestion del Panel de Asistente que Actividad (ver actividades.controller.ts).
export const crearEquipo = async (req: Request, res: Response): Promise<void> => {
    try {
        const { codigo_megued, nombre_equipo } = req.body;
        if (!codigo_megued || !nombre_equipo) {
            res.status(400).json({ message: 'El código Megued y el nombre del equipo son campos requeridos.' });
            return;
        }

        const nuevoEquipo = await Equipo.create({ codigo_megued, nombre_equipo });
        res.status(201).json(nuevoEquipo);
    } catch (err: any) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            // Pedido del usuario, 2026-10-30: solo el código tiene que ser único (el nombre ya no), y esa
            // unicidad ignora mayúsculas/minúsculas (ver equipo.ts y la migración que agrega el índice).
            res.status(400).json({ message: 'Ya existe un equipo con ese código.' });
            return;
        }
        console.error('Error al crear el equipo.', err);
        res.status(500).json({ message: 'Error al crear el equipo.' });
    }
};

/*
Importación masiva desde Excel (pestaña "Equipo" del Panel de Asistente, pedido del usuario 2026-09-29: tienen
300+ equipos y cargarlos uno por uno "se van a comer la camisa"). El parseo del .xlsx vive en el frontend (ver
excel-importar.util.ts) - acá solo llega el JSON ya mapeado ({codigo_megued, nombre_equipo}[]).
Reporta fila por fila qué se creó y qué se rechazó (y por qué) en vez de fallar todo-o-nada: con cientos de
filas pegadas/copiadas a mano, algún dato sucio (código repetido, celda vacía, texto larguísimo) es casi
seguro, y el usuario necesita saber EXACTAMENTE cuáles para poder corregirlas en el Excel y reintentar solo esas.
*/
/*
Investiga, RECIEN cuando el INSERT de una fila ya chocó de verdad contra el UNIQUE de Postgres, si el código
ya está en uso y si el dueño actual es un equipo soft-deleted (eliminado antes) o activo - consulta directa a
la BD en vez de comparar contra un mapa pre-armado. Reemplaza el enfoque anterior (chequear 'existe?' ANTES
del insert con un findAll(paranoid:false) y confiar en que ese chequeo detectó todo) porque un caso real
(2026-09-30) demostró que esa comparación previa puede fallar a detectar un choque real y caer en un mensaje
genérico que no dice nada útil - preguntándole a la BD DESPUÉS del error real, la respuesta siempre es
correcta sin importar por qué el chequeo previo se lo perdió.

Comparación SIN importar mayúsculas/minúsculas (pedido del usuario, 2026-10-30, ver equipo.ts y la migración
'20261030180000...'): "EQ-001" y "eq-001" son el mismo código para esta regla - usa fn('lower', ...) en vez de
Op.iLike para evitar que un código con '%'/'_' (caracteres especiales de LIKE) dé un falso negativo/positivo.
*/
const describirColisionEquipo = async (codigo: string): Promise<string> => {
    const porCodigo = await Equipo.findOne({
        where: where(fn('lower', col('codigo_megued')), codigo.toLowerCase()),
        paranoid: false,
    });
    if (porCodigo) {
        return porCodigo.deletedAt
            ? `el código "${codigo}" perteneció a un equipo eliminado antes - pide a un Admin que lo recupere si hace falta.`
            : `ya existe un equipo con el código "${codigo}".`;
    }
    return `El código "${codigo}" ya está en uso.`;
};

export const importarEquipos = async (req: Request, res: Response): Promise<void> => {
    try {
        const items = req.body.items;
        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ message: 'No se recibió ningún equipo para importar.' });
            return;
        }
        if (items.length > 2000) {
            res.status(400).json({ message: 'Máximo 2000 filas por importación - divide el archivo en partes más pequeñas.' });
            return;
        }

        const rechazados: { fila: number; motivo: string }[] = [];
        /*
        Duplicados DENTRO del mismo archivo (ademas de contra lo que ya existe en la BD) - chequeo en memoria,
        sin ir a la BD, antes de intentar el insert de cada fila. Solo por código (pedido del usuario,
        2026-10-30: el nombre ya no es único) y sin importar mayúsculas/minúsculas (mismo bug real que motivó
        este cambio: "EQ-001" y "eq-001" en el mismo archivo deben chocar entre sí igual que contra la BD).
        */
        const codigosEnArchivo = new Set<string>();
        let creados = 0;

        // Insercion fila por fila (no bulkCreate): asi una fila que choca no tumba las demas, y el catch de
        // abajo puede investigar EXACTAMENTE que choco recien despues del error real (ver describirColisionEquipo).
        for (let index = 0; index < (items as unknown[]).length; index++) {
            // fila 2 en el Excel = primer registro (la fila 1 es el encabezado).
            const fila = index + 2;
            const datos = (items as unknown[])[index] as { codigo_megued?: unknown; nombre_equipo?: unknown };
            const codigo = String(datos?.codigo_megued ?? '').trim();
            const nombre = String(datos?.nombre_equipo ?? '').trim();

            if (!codigo || !nombre) {
                rechazados.push({ fila, motivo: 'Falta el código o el nombre del equipo.' });
                continue;
            }
            if (codigo.length > 20) {
                rechazados.push({ fila, motivo: `El código "${codigo}" supera los 20 caracteres permitidos.` });
                continue;
            }
            if (nombre.length > 150) {
                rechazados.push({ fila, motivo: 'El nombre del equipo supera los 150 caracteres permitidos.' });
                continue;
            }
            const codigoLower = codigo.toLowerCase();
            if (codigosEnArchivo.has(codigoLower)) {
                rechazados.push({ fila, motivo: `El código "${codigo}" está repetido dentro del archivo.` });
                continue;
            }

            try {
                await Equipo.create({ codigo_megued: codigo, nombre_equipo: nombre });
                codigosEnArchivo.add(codigoLower);
                creados++;
            } catch (err: any) {
                if (err.name === 'SequelizeUniqueConstraintError') {
                    rechazados.push({ fila, motivo: await describirColisionEquipo(codigo) });
                    continue;
                }
                throw err;
            }
        }

        res.status(201).json({ creados, rechazados });
    } catch (err: any) {
        console.error('Error al importar equipos.', err);
        res.status(500).json({ message: 'Error al importar equipos.' });
    }
};

/*
Endpoint temporal de SOLO LECTURA (originalmente 2026-09-30, actualizado 2026-10-30): investigar, con datos
reales y sin adivinar, duplicados de código (incluidos los que solo difieren en mayúsculas/minúsculas - ver
la migración '20261030180000-equipos-unico-solo-por-codigo-sin-mayus.js', que ya deduplica esto una sola vez,
pero este endpoint sigue sirviendo para auditar si algo se coló de nuevo). El nombre ya no es único (pedido
del usuario, 2026-10-30), así que ya no tiene sentido agruparlo aquí. Se elimina cuando deje de hacer falta.
*/
export const diagnosticoDuplicadosEquipos = async (_req: Request, res: Response): Promise<void> => {
    try {
        const todos = await Equipo.findAll({ paranoid: false, order: [['id', 'ASC']] });
        const porCodigo = new Map<string, typeof todos>();
        for (const e of todos) {
            const c = e.codigo_megued.toLowerCase();
            if (!porCodigo.has(c)) porCodigo.set(c, [] as any);
            (porCodigo.get(c) as any).push(e);
        }
        const resumir = (e: any) => ({ id: e.id, codigo_megued: e.codigo_megued, nombre_equipo: e.nombre_equipo, deletedAt: e.deletedAt, createdAt: e.createdAt });
        const gruposCodigo = [...porCodigo.entries()].filter(([, v]) => (v as any).length > 1).map(([k, v]) => ({ valor: k, filas: (v as any).map(resumir) }));
        res.json({ total_filas: todos.length, duplicados_codigo: gruposCodigo });
    } catch (err) {
        console.error('Error en diagnostico de duplicados.', err);
        res.status(500).json({ message: 'Error en diagnostico de duplicados.' });
    }
};

// Editar un Equipo
export const actualizarEquipo = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { codigo_megued, nombre_equipo } = req.body;

        const equipo = await Equipo.findByPk(Number(id));
        if (!equipo) {
            res.status(404).json({ message: 'Este equipo no existe.' });
            return;
        }

        await equipo.update({
            codigo_megued: codigo_megued ?? equipo.codigo_megued,
            nombre_equipo: nombre_equipo ?? equipo.nombre_equipo,
        });

        res.status(200).json({ message: 'Equipo actualizado con éxito.', equipo });
    } catch (err: any) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            res.status(400).json({ message: 'Ya existe un equipo con ese código.' });
            return;
        }
        console.error('Error al actualizar el equipo.', err);
        res.status(500).json({ message: 'Error al actualizar el equipo.' });
    }
};

// Eliminar (soft-delete) un Equipo - pone deletedAt, no borra la fila: RegistroActividad ya creado sigue
// apuntando al mismo registro (ver includes con paranoid:false en asistencia/registro_actividad controllers).
export const eliminarEquipo = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const equipo = await Equipo.findByPk(Number(id));
        if (!equipo) {
            res.status(404).json({ message: 'Este equipo no se pudo encontrar.' });
            return;
        }

        await equipo.destroy();
        res.status(200).json({ message: 'Equipo eliminado exitosamente.' });
    } catch (err) {
        console.error('Error al intentar eliminar el equipo.', err);
        res.status(500).json({ message: 'Error al intentar eliminar el equipo.' });
    }
};
