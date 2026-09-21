import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Usuario } from '../models/usuario';
import { Operador } from '../models/operador';
import { Hacienda } from '../models/hacienda';

const CARGOS_VALIDOS = ['ADMIN', 'ASISTENTE', 'SUPERVISOR', 'ESCANER'];
// SUPERVISOR y ESCANER viven fisicamente en una hacienda (por eso necesitan hacienda_id); ADMIN/ASISTENTE son de oficina y no.
const CARGOS_CON_HACIENDA = ['SUPERVISOR', 'ESCANER'];

/*
Alta de un Usuario de oficina (ADMIN/ASISTENTE/SUPERVISOR/ESCANER). Requiere JWT con rol ADMIN (ver ruta).
ESCANER: la hacienda queda FIJA aqui, en la creacion - nunca se elige en el login (ver auth.controller.ts). Esto es a
proposito: si el login dejara elegir la hacienda, cualquiera podria equivocarse (o hacer trampa) y mezclar trabajadores
de una hacienda con la marcacion de otra. El login solo puede MOSTRAR a que hacienda pertenece la cuenta, nunca dejar
escogerla.
*/
export const crearUsuario = async(req:Request, res:Response):Promise<void> => {
    try{
        const { nombre_completo, usuario, clave, cargo, hacienda_id } = req.body;

        if(!nombre_completo || !usuario || !clave || !cargo){
            res.status(400).json({ message: 'nombre_completo, usuario, clave y cargo son obligatorios.'});
            return;
        }
        if(!CARGOS_VALIDOS.includes(cargo)){
            res.status(400).json({ message: `cargo debe ser uno de: ${CARGOS_VALIDOS.join(', ')}.`});
            return;
        }
        if(clave.length < 6){
            res.status(400).json({ message: 'La clave debe tener al menos 6 caracteres.'});
            return;
        }

        let haciendaIdFinal: number | null = null;
        if(CARGOS_CON_HACIENDA.includes(cargo)){
            if(!hacienda_id){
                res.status(400).json({ message: `Un ${cargo} necesita una hacienda asignada.`});
                return;
            }
            const hacienda = await Hacienda.findByPk(Number(hacienda_id));
            if(!hacienda){
                res.status(404).json({ message: 'La hacienda indicada no existe.'});
                return;
            }
            haciendaIdFinal = hacienda.id;
        }

        const usuarioExistente = await Usuario.findOne({ where: { usuario }});
        const operadorConMismoUsuario = await Operador.findOne({ where: { usuario }});
        if(usuarioExistente || operadorConMismoUsuario){
            res.status(409).json({ message: 'Ese nombre de usuario ya esta en uso.'});
            return;
        }

        const clave_hash = await bcrypt.hash(clave, 10);

        try{
            const nuevoUsuario = await Usuario.create({
                nombre_completo,
                usuario,
                clave_hash,
                cargo,
                hacienda_id: haciendaIdFinal,
            });
            const { clave_hash: _omitido, ...perfil } = nuevoUsuario.toJSON() as any;
            res.status(201).json(perfil);
        }catch(errorCreacion: any){
            // Choca contra usuarios_hacienda_id_supervisor_unico o usuarios_hacienda_id_escaner_unico (ver migracion).
            if(errorCreacion?.name === 'SequelizeUniqueConstraintError'){
                res.status(409).json({ message: `Esa hacienda ya tiene un ${cargo} asignado, o el usuario ya existe.`});
                return;
            }
            throw errorCreacion;
        }
    }catch(err){
        res.status(500).json({ message: 'Error al crear el usuario.', err});
    }
};

export const obtenerUsuarios = async(_req:Request, res:Response):Promise<void> => {
    try{
        const usuarios = await Usuario.findAll({
            attributes: { exclude: ['clave_hash'] },
            include: [{ model: Hacienda, as: 'hacienda' }],
            order: [['nombre_completo', 'ASC']],
        });
        res.json(usuarios);
    }catch(err){
        res.status(500).json({ message: 'Error al obtener los usuarios.', err});
    }
};

/*
Reseteo de una clave de un Usuario de oficina(Admin/Asistente/Supervisor/Escaner): el Admin fija una nueva, nunca puede ver la anterior (el hash no es reversible).
Require JWT con el rol ADMIN.
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
