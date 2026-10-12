import { Request, Response } from 'express';
import { Seccion } from '../models/seccion';
import { Hacienda } from '../models/hacienda';

/*
Secciones/Areas: a diferencia de Equipo/Actividad (catalogos GLOBALES, sin hacienda_id), una Seccion pertenece
a UNA hacienda puntual - por eso obtenerSecciones exige hacienda_id, no devuelve nunca "todas las secciones
del sistema" mezcladas. Gestion exclusiva de ADMIN (ver seccion.rutes.ts), dentro de la pestaña "Haciendas" del
Panel Admin (pedido del usuario, 2026-10-12) - mismo lugar donde ya se administra el Token de esa hacienda.
*/
export const obtenerSecciones = async (req: Request, res: Response): Promise<void> => {
    try {
        const { hacienda_id } = req.query;
        if (!hacienda_id) {
            res.status(400).json({ message: 'hacienda_id es obligatorio.' });
            return;
        }

        const secciones = await Seccion.findAll({
            where: { hacienda_id: Number(hacienda_id) },
            attributes: ['id', 'nombre', 'hacienda_id'],
            order: [['nombre', 'ASC']],
        });
        res.json(secciones);
    } catch (err) {
        console.error('Error al obtener las secciones.', err);
        res.status(500).json({ message: 'Error al obtener las secciones.' });
    }
};

// Dos Secciones no pueden llamarse igual DENTRO de la misma hacienda (ver UNIQUE compuesto en la migracion) -
// se chequea con paranoid:false ANTES del insert para poder avisar si el nombre perteneció a una eliminada.
const buscarColisionNombre = async (haciendaId: number, nombre: string, idAExcluir?: number) => {
    const fila = await Seccion.findOne({ where: { hacienda_id: haciendaId, nombre }, paranoid: false });
    return fila && fila.id !== idAExcluir ? fila : null;
};

export const crearSeccion = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nombre, hacienda_id } = req.body;
        if (!nombre || !String(nombre).trim() || !hacienda_id) {
            res.status(400).json({ message: 'El nombre y la hacienda son obligatorios.' });
            return;
        }

        const haciendaId = Number(hacienda_id);
        const hacienda = await Hacienda.findByPk(haciendaId);
        if (!hacienda) {
            res.status(404).json({ message: 'La hacienda indicada no existe.' });
            return;
        }

        const nombreLimpio = String(nombre).trim();
        const colision = await buscarColisionNombre(haciendaId, nombreLimpio);
        if (colision) {
            res.status(409).json({
                message: colision.deletedAt
                    ? `Ya existió una sección "${nombreLimpio}" en esta hacienda (está eliminada) - pide a un Admin que la recupere si hace falta.`
                    : `Ya existe una sección "${nombreLimpio}" en esta hacienda.`,
            });
            return;
        }

        const seccion = await Seccion.create({ nombre: nombreLimpio, hacienda_id: haciendaId });
        res.status(201).json(seccion);
    } catch (err: any) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            res.status(409).json({ message: 'Ya existe una sección con ese nombre en esta hacienda.' });
            return;
        }
        console.error('Error al crear la sección.', err);
        res.status(500).json({ message: 'Error al crear la sección.' });
    }
};

export const actualizarSeccion = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        if (!nombre || !String(nombre).trim()) {
            res.status(400).json({ message: 'El nombre es obligatorio.' });
            return;
        }

        const seccion = await Seccion.findByPk(Number(id));
        if (!seccion) {
            res.status(404).json({ message: 'Esta sección no existe.' });
            return;
        }

        const nombreLimpio = String(nombre).trim();
        const colision = await buscarColisionNombre(seccion.hacienda_id, nombreLimpio, seccion.id);
        if (colision) {
            res.status(409).json({ message: `Ya existe una sección "${nombreLimpio}" en esta hacienda.` });
            return;
        }

        await seccion.update({ nombre: nombreLimpio });
        res.json({ message: 'Sección actualizada correctamente.', seccion });
    } catch (err: any) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            res.status(409).json({ message: 'Ya existe una sección con ese nombre en esta hacienda.' });
            return;
        }
        console.error('Error al actualizar la sección.', err);
        res.status(500).json({ message: 'Error al actualizar la sección.' });
    }
};

// Soft-delete: un Operador con esta Seccion asignada (seccion_id, SET NULL en la FK) o una labor ya registrada
// contra ella NUNCA se bloquean ni se borran - solo pierden la referencia (ver migraciones de ambas FK).
export const eliminarSeccion = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const seccion = await Seccion.findByPk(Number(id));
        if (!seccion) {
            res.status(404).json({ message: 'Esta sección no se pudo encontrar.' });
            return;
        }

        await seccion.destroy();
        res.json({ message: 'Sección eliminada correctamente.' });
    } catch (err) {
        console.error('Error al eliminar la sección.', err);
        res.status(500).json({ message: 'Error al eliminar la sección.' });
    }
};
