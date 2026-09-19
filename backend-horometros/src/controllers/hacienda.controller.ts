import { Request, Response } from "express";
import crypto from 'crypto';
import { Hacienda } from "../models/hacienda";

//24h: vigencia del Token de Hacienda(distinto del JWT de sesion)
const TOKEN_VIGENCIA_MS = 24*60*60*1000;

/*
Gerena/regenera ek Token de Hacienda. Solo el Supervisor de esa Hacienda puede hacerlo (o un Admin, que puede tocar cualquiera). 
No es un JWT:es una cadena aleatoria que se guarda en la BD porque cada escaneo QR la tiene que poder consultar.
*/
export const generarTokenHacienda = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const haciendaId = Number(id);

        if(req.auth?.rol === 'SUPERVISOR' && req.auth.hacienda_id !== haciendaId){
            res.status(403).json({ message:'No puedes generar el token de una hacienda que no es la tuya.'});
            return;
        }

        const hacienda =await Hacienda.findByPk(haciendaId);
        if(!hacienda){
            res.status(404).json({message:'Hacienda no encontrada.'});
            return;
        }

        const token = crypto.randomBytes(20).toString('hex');
        const expiraEn = new Date(Date.now() + TOKEN_VIGENCIA_MS);

        await hacienda.update({
            token_actual: token,
            token_expira_en: expiraEn,
        });

        res.json({
            messaje:'Token de hacienda generado correctamente',
            token_actual: token,
            token_expira_en: expiraEn
        });

    }catch(err){
        res.status(500).json({ message:'Error al generar el token de la hacienda',err});

    }
};

//Invalida el token de Hacienda anres de su vemcimiento natural vencimiento(misma regla de permisos que generar)
export const invalidarToken = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const haciendaId = Number(id);

        if(req.auth?.rol === 'SUPERVISOR' && req.auth.hacienda_id !== haciendaId){
            res.status(403).json({
                message: 'No puedes invalidar el token de una hacienda que no es tuya.'
            });
            return;
        }

        const hacienda= await Hacienda.findByPk(haciendaId);
        if(!hacienda){
            res.status(404).json({ message:'Hacienda no encontrada.'});
            return;
        }

        await hacienda.update({
            token_actual:null,
            token_expira_en:null,
        });

        res.json({ message:'Token de hacienda invalidado correctamente.'});

    }catch(err){
        res.status(500).json({message:'Error al invalidar el token de hacienda.',err});

    }
};