import { Request, Response, NextFunction } from "express";
import { verificarToken, PayloadToken } from "../services/jwt.service";

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