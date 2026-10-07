import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { Usuario } from '../models/usuario';
import { Operador } from '../models/operador';
import { Hacienda } from '../models/hacienda';
import { registrarAuditoria } from '../utils/registrar-auditoria';

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
        const { nombre_completo, cargo, hacienda_id } = req.body;

        if(!nombre_completo || !req.body.usuario || !req.body.clave || !cargo){
            res.status(400).json({ message: 'nombre_completo, usuario, clave y cargo son obligatorios.'});
            return;
        }
        if(!CARGOS_VALIDOS.includes(cargo)){
            res.status(400).json({ message: `cargo debe ser uno de: ${CARGOS_VALIDOS.join(', ')}.`});
            return;
        }
        /*
        Se recorta usuario/clave (espacios al inicio/final) ANTES de guardar, no solo al comparar en el login:
        un espacio de mas quedaba GUARDADO dentro del hash si venia pegado por autocompletar/autocorrector del
        celular, y ahi ni el login mas tolerante lo salva - caso real (2026-09-30), ver auth.controller.ts.
        */
        const usuario = String(req.body.usuario).trim();
        const clave = String(req.body.clave).trim();
        if(clave.length < 8){
            res.status(400).json({ message: 'La clave debe tener al menos 8 caracteres.'});
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

        // Comparacion sin distinguir mayusculas - mismo motivo que en auth.controller.ts (login).
        const usuarioLike = { [Op.iLike]: usuario };
        const usuarioExistente = await Usuario.findOne({ where: { usuario: usuarioLike }});
        const operadorConMismoUsuario = await Operador.findOne({ where: { usuario: usuarioLike }});
        if(usuarioExistente || operadorConMismoUsuario){
            const nombreExistente = usuarioExistente?.nombre_completo ?? operadorConMismoUsuario?.nombre_completo;
            res.status(409).json({ message: `El usuario "${usuario}" ya está en uso por ${nombreExistente}.`});
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
        console.error('Error al crear el usuario:', err);
        res.status(500).json({ message: 'Error al crear el usuario. Intenta de nuevo.'});
    }
};

// where: { activo: true } - una vez eliminada (soft-delete, ver eliminarUsuario abajo) una cuenta deja de
// aparecer aqui, igual que un Operador eliminado deja de aparecer en el Directorio (mismo patron, pero sin
// 'paranoid' porque Usuario ya tenia el campo 'activo' desde antes, usado por el login para bloquear el acceso -
// agregar deletedAt hubiera sido una segunda forma de decir lo mismo).
export const obtenerUsuarios = async(_req:Request, res:Response):Promise<void> => {
    try{
        const usuarios = await Usuario.findAll({
            where: { activo: true },
            attributes: { exclude: ['clave_hash'] },
            include: [{ model: Hacienda, as: 'hacienda' }],
            order: [['nombre_completo', 'ASC']],
        });
        res.json(usuarios);
    }catch(err){
        console.error('Error al obtener los usuarios.', err);
        res.status(500).json({ message: 'Error al obtener los usuarios.' });
    }
};

/*
Reseteo de una clave de un Usuario de oficina(Admin/Asistente/Supervisor/Escaner): el Admin fija una nueva, nunca puede ver la anterior (el hash no es reversible).
Require JWT con el rol ADMIN.
*/
export const resetearClaveUsuario = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        // Recortar espacios al inicio/final ANTES de guardar - ver crearUsuario, mismo motivo.
        const clave = typeof req.body.clave === 'string' ? req.body.clave.trim() : req.body.clave;

        if(!clave || clave.length < 8){
            res.status(400).json({message:'La clave debe tener al menos 8 caracteres.'});
            return;
        }

        const usuario = await Usuario.findByPk(Number(id));
        if(!usuario){
            res.status(404).json({message:'Usuario no encontrado.'});
            return;
        }

        const clave_hash = await bcrypt.hash(clave, 10);
        // sesion_valida_desde: cualquier JWT emitido ANTES de este instante deja de servir (ver CLAUDE.md,
        // "Revocacion de sesiones JWT") - sin esto, la clave vieja quedaba inutil pero la SESION seguia viva.
        await usuario.update({ clave_hash, sesion_valida_desde: new Date() });

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'RESETEAR_CLAVE_USUARIO',
            objetivoTipo: 'usuario',
            objetivoId: usuario.id,
            objetivoNombre: usuario.nombre_completo,
        });

        res.json({ message:'Clave del usuario actualizado correctamente.'});

    }catch(err){
        console.error('Error al rescatar la clave del usuario.', err);
        res.status(500).json({ message: 'Error al rescatar la clave del usuario.' });

    }
};

/*
Eliminar (soft-delete) una cuenta de oficina (ADMIN/ASISTENTE/SUPERVISOR/ESCANER) - mismo boton y misma idea que
ya existe para Mecanicos/Operadores (ver eliminarOperador, asistencia.controller.ts), pero usando el campo
'activo' que Usuario ya tenia desde el principio (el login YA lo revisa, ver auth.controller.ts) en vez de
agregar un 'deletedAt'/paranoid nuevo - serian 2 formas de decir lo mismo. Al "eliminarla": deja de aparecer en
obtenerUsuarios (arriba), el login la rechaza, y cualquier sesion YA ABIERTA de esa cuenta tambien se corta al
instante (sesion_valida_desde, mismo mecanismo que resetearClaveUsuario) - no tiene sentido desactivar una
cuenta y que su JWT ya emitido siga sirviendo hasta que expire solo. Al igual que eliminarOperador, no hay forma
de "deshacerlo" desde el panel (si hace falta, se crea una cuenta nueva).
*/
export const eliminarUsuario = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const idNumero = Number(id);

        // Nadie puede eliminar su propia cuenta desde aqui - se quedaria sin sesion (sesion_valida_desde) y sin
        // poder volver a entrar (activo:false) en el mismo clic, sin que haya forma de deshacerlo desde el panel.
        if(req.auth?.tipo === 'usuario' && req.auth.id === idNumero){
            res.status(400).json({ message: 'No puedes eliminar tu propia cuenta.' });
            return;
        }

        const usuario = await Usuario.findByPk(idNumero);
        if(!usuario){
            res.status(404).json({ message: 'Usuario no encontrado.' });
            return;
        }

        await usuario.update({ activo: false, sesion_valida_desde: new Date() });

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'ELIMINAR_USUARIO',
            objetivoTipo: 'usuario',
            objetivoId: usuario.id,
            objetivoNombre: usuario.nombre_completo,
        });

        res.json({ message: 'Usuario eliminado correctamente.' });
    }catch(err){
        console.error('Error al eliminar el usuario.', err);
        res.status(500).json({ message: 'Error al eliminar el usuario.' });
    }
};
