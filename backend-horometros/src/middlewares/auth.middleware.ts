import { Request, Response, NextFunction } from "express";
import { verificarToken, PayloadToken } from "../services/jwt.service";
import { Asistencia } from "../models/asistencias";

declare global {
    namespace Express{
        interface Request{
            auth?: PayloadToken;
        }
    }
}

/*
Verifica que venga un JWT valido en el header 'Authorization: Bearer <token>'.
No consulta la base de datos: la firma ya garantizada que el contenido no fue alterado
*/
export const verificarAutenticacion = (req:Request, res:Response, next:NextFunction):void => {
    const header = req.headers.authorization;
    if(!header || !header.startsWith('Bearer ')){
        res.status(401).json({ message:'Falta el token de autenticacion.'});
        return;
    }

    const token = header.slice('Bearer '.length);
    try{
        req.auth = verificarToken(token);
        next();

    } catch(err){
        res.status(401).json({message: 'Token invalido o expirado.'});

    }
};

/*
Uso: router.post('/', verificarAutenticacion, requireRol('ADMIN','SUPERVISOR'), controlador)
Debe ir SIEMPRE despues de verificarAutenticacion (depende de req.auth ys seteado).
*/
export const requireRol = (...rolesPermitidos:string[]) => {
    return (req:Request, res:Response, next:NextFunction):void =>{
        if(!req.auth){
            res.status(401).json({ message:'Falta el token de autenticacion.'});
            return;
        }
        if(!rolesPermitidos.includes(req.auth.rol)){
            res.status(403).json({ message:'No tiene permiso para realizar esta accion.'});
            return;
        }
        next();
    };
};

const getFechaLocalEcuador = ():string => {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guayaquil' });
};

// Mismos estados que auth.controller.ts (login) considera "hoy ya no hay nada mas que hacer".
const ESTADOS_JORNADA_CERRADA = ['PENDIENTE_REVISION', 'FINALIZADO', 'SALIDA_OLVIDADA', 'OBSERVANDO'];

/*
Login bloquea la emision de un token NUEVO cuando la jornada de hoy ya esta cerrada (ver auth.controller.ts), pero un
token YA EMITIDO esta mañana sigue firmando valido por sus 8h de JWT hasta que se revise aqui. Este middleware es el
que revisa, en cada request de un Operador/Mecanico, si su jornada de HOY sigue abierta - si el Supervisor la cerro
(o el propio trabajador ya marco salida) mientras el token seguia "vivo", lo cortamos y le pedimos loguearse de nuevo.
Debe ir SIEMPRE despues de verificarAutenticacion. No aplica a ADMIN/ASISTENTE/SUPERVISOR/ESCANER (tipo:'usuario'):
esos siguen con la sesion de 8h de siempre.
*/
export const verificarJornadaOperadorActiva = async(req:Request, res:Response, next:NextFunction):Promise<void> => {
    if(!req.auth){
        res.status(401).json({ message:'Falta el token de autenticacion.'});
        return;
    }
    if(req.auth.tipo !== 'operador'){
        next();
        return;
    }
    try{
        const hoy = getFechaLocalEcuador();
        const asistenciaHoy = await Asistencia.findOne({
            where: { operador_id: req.auth.id, fecha: hoy },
        });
        if(asistenciaHoy && ESTADOS_JORNADA_CERRADA.includes(asistenciaHoy.estado)){
            res.status(401).json({ message: 'Tu jornada de hoy ya fue cerrada. Vuelve a iniciar sesion.'});
            return;
        }
        next();
    }catch(err){
        res.status(500).json({ message: 'Error al verificar el estado de la jornada.', err});
    }
};