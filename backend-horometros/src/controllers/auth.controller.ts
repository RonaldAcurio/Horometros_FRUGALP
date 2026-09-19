import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Usuario } from '../models/usuario';
import { Operador } from '../models/operador';
import { generarToken } from '../services/jwt.service';

/*
Login unico (pantalla unica ver en el frontend, en CLAUDE.md): un mismo usuario no puede existit a la vez en 'usuarios' Y en 'operadores' (se valida al crear
cada cuenta, no aqui), asi que primero busca en una tabla y luego en otra nuca es ambiguo.
*/
export const login = async(req: Request, res: Response):Promise<void> => {
    try{
        const {usuario, clave} = req.body;
        if(!usuario || !clave){
            res.status(400).json({ message:'Usuario y clave con obligatorios.'});
            return;
        }

        //1. Buscar en 'usuarios'(ADMIN/ASISTENTE/SUPERVISOR)
        const cuentaUsuario = await Usuario.findOne({ where:{ usuario }});
        if(cuentaUsuario){
            if(!cuentaUsuario.activo){
                res.status(403).json({ message:'Esta ceunta esta desactivada.'});
                return;
            }
            const claveValida = await bcrypt.compare(clave, cuentaUsuario.clave_hash);
            if(!claveValida){
                res.status(401).json({ message:'Usuario o clave incorrectos.'});
                return;
            }

            const token =generarToken({
                id: cuentaUsuario.id,
                tipo: 'usuario',
                rol: cuentaUsuario.cargo,
                hacienda_id: cuentaUsuario.hacienda_id,
            });

            res.json({
                token,
                perfil:{
                    id: cuentaUsuario.id,
                    nombre_completo: cuentaUsuario.nombre_completo,
                    rol: cuentaUsuario.cargo,
                    hacienda_id: cuentaUsuario.hacienda_id,
                },
            });
            return;
        }

        //2. No estaba e 'usuarios' -> buscar en 'operadores' (Mecanico/Operador)
        const cuentaOperador = await Operador.findOne({ where:{ usuario }});
        if(cuentaOperador && cuentaOperador.clave_hash){
            const claveValido = await bcrypt.compare(clave, cuentaOperador.clave_hash);
            if(!claveValido){
                res.status(401).json({ message:'Usuario o clave incorrectos.'});
                return;
            }

            //la hacienda del Operador la resuelve su SUPERVISOR (no tiene hacienda_id propio).
            let haciendaId: number | null=null;
            if(cuentaOperador.supervisor_id){
                const supervisor = await Usuario.findByPk(cuentaOperador.supervisor_id);
                haciendaId = supervisor?.hacienda_id ?? null;
            }

            const token = generarToken({
                id: cuentaOperador.id,
                tipo: 'operador',
                rol: cuentaOperador.rol || 'MECANICO',
                hacienda_id: haciendaId,
            });

            res.json({
                token,
                perfil:{
                    id: cuentaOperador.id,
                    nombre_completo: cuentaOperador.nombre_completo,
                    rol: cuentaOperador.rol,
                    hacienda_id: haciendaId,
                },
            });
            return;
        }

        //No se encontro en ninguna de las dos tablas
        res.status(401).json({ message:'Usuario o clave incorrectos.'});

    }catch(err){
        res.status(500).json({ message:'Error al iniciar sesion.', err});

    }
}