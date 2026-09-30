import { Request, Response } from 'express';
import { Op } from 'sequelize';
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
            res.status(400).json({ message: 'Ya existe un equipo con ese código o nombre.' });
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

        /*
        Bug real encontrado por el usuario (2026-09-30): 'paranoid:false' es a proposito - sin esto, un equipo
        que YA fue eliminado (soft-delete, botón 🗑️) no aparece en un findAll() normal, así que este chequeo lo
        daba por libre... pero el UNIQUE de Postgres sobre codigo_megued/nombre_equipo sigue viendo esa fila
        eliminada como ocupada (el soft-delete no libera el código/nombre). Antes, esa fila pasaba el chequeo,
        llegaba al bulkCreate de abajo, y chocaba ahí contra el UNIQUE - reventando TODA la importación con un
        500 genérico ("Error al importar equipos"), incluso perdiendo las demás filas del archivo que sí eran
        válidas (bulkCreate es un solo INSERT: si una fila falla, no se inserta ninguna). Con paranoid:false se
        detecta ANTES, se rechaza solo esa fila con un motivo claro, y el resto del archivo se importa normal.
        */
        const existentes = await Equipo.findAll({ attributes: ['codigo_megued', 'nombre_equipo', 'deletedAt'], paranoid: false });
        const codigosExistentes = new Map(existentes.map((e) => [e.codigo_megued.trim().toLowerCase(), !!e.deletedAt]));
        const nombresExistentes = new Map(existentes.map((e) => [e.nombre_equipo.trim().toLowerCase(), !!e.deletedAt]));

        const validos: { codigo_megued: string; nombre_equipo: string }[] = [];
        const rechazados: { fila: number; motivo: string }[] = [];
        // Duplicados DENTRO del mismo archivo (ademas de contra lo que ya existe en la BD) - sin esto, 2 filas
        // con el mismo codigo se insertarian ambas de un tiron via bulkCreate y chocarian recien contra el
        // UNIQUE de Postgres, tumbando la importacion COMPLETA en vez de solo esas 2 filas.
        const codigosEnArchivo = new Set<string>();
        const nombresEnArchivo = new Set<string>();

        (items as unknown[]).forEach((item, index) => {
            // fila 2 en el Excel = primer registro (la fila 1 es el encabezado).
            const fila = index + 2;
            const datos = item as { codigo_megued?: unknown; nombre_equipo?: unknown };
            const codigo = String(datos?.codigo_megued ?? '').trim();
            const nombre = String(datos?.nombre_equipo ?? '').trim();

            if (!codigo || !nombre) {
                rechazados.push({ fila, motivo: 'Falta el código o el nombre del equipo.' });
                return;
            }
            if (codigo.length > 20) {
                rechazados.push({ fila, motivo: `El código "${codigo}" supera los 20 caracteres permitidos.` });
                return;
            }
            if (nombre.length > 150) {
                rechazados.push({ fila, motivo: 'El nombre del equipo supera los 150 caracteres permitidos.' });
                return;
            }
            const codigoLower = codigo.toLowerCase();
            const nombreLower = nombre.toLowerCase();
            if (codigosExistentes.has(codigoLower)) {
                const fueEliminado = codigosExistentes.get(codigoLower);
                rechazados.push({
                    fila,
                    motivo: fueEliminado
                        ? `El código "${codigo}" perteneció a un equipo eliminado antes - pide a un Admin que lo recupere si hace falta, no se puede reimportar con el mismo código.`
                        : `Ya existe un equipo con el código "${codigo}".`,
                });
                return;
            }
            if (nombresExistentes.has(nombreLower)) {
                const fueEliminado = nombresExistentes.get(nombreLower);
                rechazados.push({
                    fila,
                    motivo: fueEliminado
                        ? `El nombre "${nombre}" perteneció a un equipo eliminado antes - pide a un Admin que lo recupere si hace falta, no se puede reimportar con el mismo nombre.`
                        : `Ya existe un equipo con el nombre "${nombre}".`,
                });
                return;
            }
            if (codigosEnArchivo.has(codigoLower)) {
                rechazados.push({ fila, motivo: `El código "${codigo}" está repetido dentro del archivo.` });
                return;
            }
            if (nombresEnArchivo.has(nombreLower)) {
                rechazados.push({ fila, motivo: `El nombre "${nombre}" está repetido dentro del archivo.` });
                return;
            }

            codigosEnArchivo.add(codigoLower);
            nombresEnArchivo.add(nombreLower);
            validos.push({ codigo_megued: codigo, nombre_equipo: nombre });
        });

        const creados = validos.length > 0 ? await Equipo.bulkCreate(validos) : [];
        res.status(201).json({ creados: creados.length, rechazados });
    } catch (err: any) {
        // Red de seguridad además del chequeo de arriba (ej. 2 Asistentes importando al mismo tiempo el mismo
        // código) - no debería pasar casi nunca ya con paranoid:false arriba, pero si pasa, mejor este mensaje
        // que el genérico de abajo.
        if (err.name === 'SequelizeUniqueConstraintError') {
            res.status(409).json({ message: 'Alguna fila choca con un código o nombre que otra persona acaba de crear - vuelve a intentar la importación.' });
            return;
        }
        console.error('Error al importar equipos.', err);
        res.status(500).json({ message: 'Error al importar equipos.' });
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
            res.status(400).json({ message: 'Ya existe un equipo con ese código o nombre.' });
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
