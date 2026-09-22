import { Request, Response } from 'express';
import { Equipo } from '../models';

/*
Catalogo de Equipos (maquinaria) para el selector del Panel de Actividades (MECANICO/OPERADOR eligen sobre que
equipo trabajaron). Es de solo lectura aqui - el CRUD completo de Equipo pertenece al modulo Horometros, que no
se toca (ver CLAUDE.md, "el usuario quiere sacarlo a un proyecto aparte").
*/
export const obtenerEquipos = async(_req: Request, res: Response): Promise<void> => {
    try {
        const equipos = await Equipo.findAll({
            attributes: ['id', 'codigo_megued', 'nombre_equipo'],
            order: [['nombre_equipo', 'ASC']],
        });
        res.json(equipos);
    } catch (err) {
        res.status(500).json({ message: 'Error al obtener los equipos.', err });
    }
};
