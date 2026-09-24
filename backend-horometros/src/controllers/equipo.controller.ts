import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Equipo } from '../models';

/*
Catalogo de Equipos (maquinaria): lo lee el selector del Panel de Actividades (MECANICO/OPERADOR eligen sobre
que equipo trabajaron) y la pestaña "Equipo" del Panel de Asistente (gestion: crear/editar/eliminar, ver abajo).
Ambos comparten el mismo modelo `Equipo` que el modulo Horometros usa para sus lecturas OCR (`ultimo_km_inicial`/
`ultimo_real`/`numero_hoja`/`tiene_tope_10k`) - esos campos horometros-especificos no se tocan ni se piden aqui.
Paginado (mismo patron que `obtenerAsistenciaHoy`) porque el catalogo puede crecer. `q` opcional filtra por
codigo_megued/nombre_equipo - lo usa el autocompletar del selector y el buscador de la pestaña de gestion.
*/
export const obtenerEquipos = async(req: Request, res: Response): Promise<void> => {
    try {
        const pagina = Math.max(1, Number(req.query['pagina']) || 1);
        const limite = Math.min(100, Math.max(1, Number(req.query['limite']) || 20));
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
        res.status(500).json({ message: 'Error al obtener los equipos.', err });
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
        res.status(500).json({ message: 'Error al crear el equipo.', err });
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
        res.status(500).json({ message: 'Error al actualizar el equipo.', err });
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
        res.status(500).json({ message: 'Error al intentar eliminar el equipo.', err });
    }
};
