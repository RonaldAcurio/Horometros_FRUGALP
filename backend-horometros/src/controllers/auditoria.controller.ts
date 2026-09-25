import { Request, Response } from 'express';
import { RegistroAuditoria } from '../models/registro_auditoria';
import { Usuario } from '../models/usuario';

// Fijo en 20 (a diferencia del Historial de Asistencia, que deja elegir 'limite' por query) - esta pestaña
// se visita poco y no tiene ningun filtro que justifique paginas mas grandes, ver CLAUDE.md.
const LIMITE_POR_PAGINA = 20;

/*
Historial de acciones sensibles (reseteo de claves, generar/invalidar Token de Hacienda) para la pestaña
"Historial" del Menu Admin (ver CLAUDE.md). Solo ADMIN (ver la ruta) - es la unica cuenta con visibilidad sobre
TODO lo que hacen tanto ADMIN como ASISTENTE, que es justamente el punto de tener esto.

Paginado con el mismo patron que obtenerHistorial/obtenerAsistenciaHoy (asistencia.controller.ts): sin esto,
una cuenta con meses de reseteos/tokens generados traeria todo de una sola vez.
*/
export const obtenerAuditoria = async(req:Request, res:Response):Promise<void> => {
    try{
        const paginaActual = Math.max(1, Number(req.query['pagina']) || 1);
        const offset = (paginaActual - 1) * LIMITE_POR_PAGINA;

        const { rows: registros, count: total } = await RegistroAuditoria.findAndCountAll({
            include: [{ model: Usuario, as: 'actor', attributes: ['nombre_completo', 'cargo'] }],
            order: [['createdAt', 'DESC']],
            limit: LIMITE_POR_PAGINA,
            offset,
        });

        res.json({
            data: registros,
            total,
            pagina: paginaActual,
            totalPaginas: Math.ceil(total / LIMITE_POR_PAGINA) || 1,
        });
    }catch(err){
        res.status(500).json({ message: 'Error al obtener el historial de auditoria.', err});
    }
};
