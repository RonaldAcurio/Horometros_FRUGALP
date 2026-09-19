import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Usuario } from '../models/usuario';

/*
Reseteo de una clave de un Usuario de oficina(Admin/Asistente/Supervisor): el Admin fija una nueva, nunca puede ver la anterior (el hash no es reversible).
Require JWT con el rol ADMIN.
NOTA de alcance: esto es SOLO el reseteo de clave, El ata/edicion/listado de Usuario es parte del Menu Admin(frontend)
*/
export const resetearClaveUsuario = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { clave } = req.body;

        if(!clave || clave.length<6 ){
            res.status(400).json({message:'La clave debe tener al menos 6 caracteres.'});
            return;
        }

        const usuario = await Usuario.findByPk(Number(id));
        if(!usuario){
            res.status(404).json({message:'Usuario no encontrado.'});
            return;
        }

        const clave_hash = await bcrypt.hash(clave, 10);
        await usuario.update({ clave_hash });

        res.json({ message:'Clave del usuario actualizado correctamente.'});

    }catch(err){
        res.status(500).json({message:'Error al rescatar la clave del usuario.',err});

    }
};