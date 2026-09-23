import { Request, Response } from 'express';
import { Equipo } from '../models';

/*
Catalogo de Equipos (maquinaria) para el selector del Panel de Actividades (MECANICO/OPERADOR eligen sobre que
equipo trabajaron). Es de solo lectura aqui - el CRUD completo de Equipo pertenece al modulo Horometros, que no
se toca (ver CLAUDE.md, "el usuario quiere sacarlo a un proyecto aparte"). Paginado (mismo patron que
`obtenerAsistenciaHoy`) porque el catalogo puede crecer y el unico consumidor de este endpoint es ese selector -
no hay otra pantalla que dependa de recibir el arreglo completo de una sola vez.
*/
export const obtenerEquipos = async(req: Request, res: Response): Promise<void> => {
    try {
        const pagina = Math.max(1, Number(req.query['pagina']) || 1);
        const limite = Math.min(100, Math.max(1, Number(req.query['limite']) || 20));
        const offset = (pagina - 1) * limite;

        const { rows: equipos, count: total } = await Equipo.findAndCountAll({
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
