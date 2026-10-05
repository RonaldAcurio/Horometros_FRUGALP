import { Request, Response } from 'express';
import { RegistroPeticion } from '../models/registro_peticion';
import { Op } from 'sequelize';

// Mismo patron que obtenerAuditoria (auditoria.controller.ts) - fijo en 30, esta tabla crece mucho mas rapido
// (cubre TODA peticion, no solo acciones administrativas) asi que paginar es obligatorio, no opcional.
const LIMITE_POR_PAGINA = 30;

/*
Historial de TODAS las peticiones (ver registrar-peticion.middleware.ts) - solo ADMIN. Filtros opcionales por
query: 'actor_tipo' ('usuario'|'operador'), 'actor_rol' (ADMIN/SUPERVISOR/.../MECANICO/OPERADOR), 'status_code'
(exacto) y 'desde'/'hasta' (fecha YYYY-MM-DD, sobre createdAt) - sin ningun filtro, trae la pagina mas reciente
de TODO, que es justo lo que hace falta para un incidente puntual como "¿qué paso a tal hora?".
*/
export const obtenerRegistrosPeticion = async(req:Request, res:Response):Promise<void> => {
    try{
        const paginaActual = Math.max(1, Number(req.query['pagina']) || 1);
        const offset = (paginaActual - 1) * LIMITE_POR_PAGINA;

        const where: any = {};
        if(req.query['actor_tipo']) where.actor_tipo = req.query['actor_tipo'];
        if(req.query['actor_rol']) where.actor_rol = req.query['actor_rol'];
        if(req.query['status_code']) where.status_code = Number(req.query['status_code']);
        if(req.query['desde'] || req.query['hasta']){
            where.createdAt = {};
            if(req.query['desde']) where.createdAt[Op.gte] = new Date(`${req.query['desde']}T00:00:00`);
            if(req.query['hasta']) where.createdAt[Op.lte] = new Date(`${req.query['hasta']}T23:59:59`);
        }

        const { rows: registros, count: total } = await RegistroPeticion.findAndCountAll({
            where,
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
        console.error('Error al obtener el historial de peticiones.', err);
        res.status(500).json({ message: 'Error al obtener el historial de peticiones.' });
    }
};
