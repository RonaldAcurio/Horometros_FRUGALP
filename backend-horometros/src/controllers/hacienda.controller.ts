import { Request, Response } from "express";
import crypto from 'crypto';
import { Hacienda } from "../models/hacienda";
import { registrarAuditoria } from "../utils/registrar-auditoria";

//24h: vigencia del Token de Hacienda(distinto del JWT de sesion)
const TOKEN_VIGENCIA_MS = 24*60*60*1000;

/*
Lista de haciendas: la usa el Frontend para los selectores (asignar hacienda a un Usuario ESCANER/SUPERVISOR
nuevo, elegir para cual generar el Token). Requiere JWT con rol ADMIN o SUPERVISOR (ver la ruta).
*/
export const obtenerHaciendas = async(_req:Request, res:Response):Promise<void> => {
    try{
        const haciendas = await Hacienda.findAll({ order: [['nombre', 'ASC']] });
        res.json(haciendas);
    }catch(err){
        res.status(500).json({ message: 'Error al obtener las haciendas.', err});
    }
};

/*
Crea una hacienda nueva. Solo ADMIN (ver la ruta) - a diferencia de generar/invalidar Token, un Supervisor no
crea haciendas (el solo administra la suya, que ya existe antes de que el exista como cuenta).
*/
export const crearHacienda = async(req:Request, res:Response):Promise<void> => {
    try{
        const { nombre } = req.body;
        if(!nombre || !nombre.trim()){
            res.status(400).json({ message: 'El nombre de la hacienda es obligatorio.'});
            return;
        }

        const existente = await Hacienda.findOne({ where: { nombre: nombre.trim() }});
        if(existente){
            res.status(409).json({ message: 'Ya existe una hacienda con ese nombre.'});
            return;
        }

        const hacienda = await Hacienda.create({ nombre: nombre.trim() });
        res.status(201).json(hacienda);
    }catch(err){
        res.status(500).json({ message: 'Error al crear la hacienda.', err});
    }
};

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

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'GENERAR_TOKEN_HACIENDA',
            objetivoTipo: 'hacienda',
            objetivoId: hacienda.id,
            objetivoNombre: hacienda.nombre,
        });

        res.json({
            message:'Token de hacienda generado correctamente',
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

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'INVALIDAR_TOKEN_HACIENDA',
            objetivoTipo: 'hacienda',
            objetivoId: hacienda.id,
            objetivoNombre: hacienda.nombre,
        });

        res.json({ message:'Token de hacienda invalidado correctamente.'});

    }catch(err){
        res.status(500).json({message:'Error al invalidar el token de hacienda.',err});

    }
};