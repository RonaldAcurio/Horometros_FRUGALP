import { Request, Response } from 'express';
import { RegistroAuditoria } from '../models/registro_auditoria';
import { Usuario } from '../models/usuario';

/*
Historial de acciones sensibles (reseteo de claves, generar/invalidar Token de Hacienda) para la pestaña
"Historial" del Menu Admin (ver CLAUDE.md). Solo ADMIN (ver la ruta) - es la unica cuenta con visibilidad sobre
TODO lo que hacen tanto ADMIN como ASISTENTE, que es justamente el punto de tener esto.
*/
export const obtenerAuditoria = async(_req:Request, res:Response):Promise<void> => {
    try{
        const registros = await RegistroAuditoria.findAll({
            include: [{ model: Usuario, as: 'actor', attributes: ['nombre_completo', 'cargo'] }],
            order: [['createdAt', 'DESC']],
            limit: 200,
        });
        res.json(registros);
    }catch(err){
        res.status(500).json({ message: 'Error al obtener el historial de auditoria.', err});
    }
};
