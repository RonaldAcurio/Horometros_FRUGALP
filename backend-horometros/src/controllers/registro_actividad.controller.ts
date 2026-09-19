import { Request, Response } from "express";
import { RegistroActividad } from "../models/registro_actividad";
import { Asistencia } from "../models/asistencias";
import { Equipo } from "../models/equipo";
import { Actividad } from "../models/actividad";
import { Seccion } from "../models/seccion";

const ROLES_OFICINA = ['ADMIN','ASISTENTE','SUPERVISOR'];
/*
Un Mecanico/Operador solo puede tocar su PROPIA jornada. UN rol de oficina (Admin/ Asistente/Supervisor) puede tocar cualquiera
(correciones, revision). Centralizado aqui porque los 3 endpoint de abajo repiten la misma regla
*/

const puedeOperarSobre = (req:Request, operadorIdDeLaAsistencia:number):boolean =>{
    if(!req.auth) return false;
    if(ROLES_OFICINA.includes(req.auth.rol)) return true;
    return req.auth.tipo === 'operador' && req.auth.id === operadorIdDeLaAsistencia;
}

//Crear una nueva labor dentro de la jornada abierta del trabajador (Panel de Actividades)
export const crearRegistroActividad = async(req:Request, res:Response):Promise<void> => {
    try{
        const { asistencia_id, equipo_id, actividad_id, area, seccion_id, observaciones } = req.body;
        if(!asistencia_id || !equipo_id || !actividad_id){
            res.status(400).json({ message:'asistencia_id, equipo_id y actividad_id son obligatios.'});
            return;
        }

        const asistencia = await Asistencia.findByPk(Number(asistencia_id));
        if(!asistencia){
            res.status(404).json({ message:'La jornada indicada no existe.'});
            return;
        }

        if(!puedeOperarSobre(req, asistencia.operador_id)){
            res.status(403).json({ message:'No puedes registrar actividades en la jornada de otro trabajador.'});
            return;
        }

        if(asistencia.estado !== 'EN_JORNADA'){
            res.status(400).json({ message: 'Esta jornada ya no esta activa: no se puede agregar mas labores.'});
            return;
        }

        const equipo = await Equipo.findByPk(Number(equipo_id));
        if(!equipo){
            res.status(404).json({ message:'El equipo indicado no existe.'});
            return;
        }

        const actividad = await Actividad.findByPk(Number(actividad_id));
        if(!actividad){
            res.status(404).json({ message:'La actividad indicada no existe o esta inactiva.'});
            return;
        }

        if(seccion_id){
            const seccion = await Seccion.findByPk(Number(seccion_id));
            if(!seccion){
                res.status(404).json({ message:'La seccion indicada no existe.'});
                return;
            }
        }

        const registro = await RegistroActividad.create({
            asistencia_id: asistencia.id,
            equipo_id: equipo.id,
            actividad_id: actividad.id,
            area: area || null,
            seccion_id: seccion_id ? Number(seccion_id) : null,
            observaciones: observaciones || null,
            hora_inicio: new Date(),
        });
        
        res.status(201).json(registro);

    }catch(err){
        res.status(500).json({message: 'Error al crear el registro de actividad.',err});

    }
};

//Cerrar una labor ya iniciada(marcar hora_fin y permite ajustar observaciones al cerrar)
export const finalizarRegistroActividad = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { observaciones } = req.body;

        const registro = await RegistroActividad.findByPk(Number(id));
        if(!registro){
            res.status(404).json({ message:'Registro de actividad no encontrado.'});
            return;
        }

        const asistencia = await Asistencia.findByPk(registro.asistencia_id);
        if(!asistencia || !puedeOperarSobre(req, asistencia.operador_id)){
            res.status(403).json({ message:'No puedes modificar la actividad de otro trabajador.'});
            return;
        }

        if(registro.hora_fin){
            res.status(400).json({ message:'Esta labor ya fue finalizado anteriormente.'});
            return;
        }

        await registro.update({
            hora_fin: new Date(),
            observaciones: observaciones ?? registro.observaciones,
        });

        res.json({ message: 'Labor fibalizada correctamente.',registro });

    }catch(err){
        res.status(500).json({ message: 'Error al finalizar el registro de actividad.', err});

    }
};

//Listar las labores de una jornada puntual (para al Panel de Actividades y el reporte imprimible)
export const obtenerRegistrosPorAsistencia = async (req:Request, res:Response):Promise<void> => {
    try{
        const asistenciaId = req.query['asistencia_id'];
        if(!asistenciaId){
            res.status(400).json({ message:'El parametro asistencia_id es obligatorio.'});
            return;
        }

        const asistencia = await Asistencia.findByPk(Number(asistenciaId));
        if(!asistencia){
            res.status(404).json({ message:'La jornada indicada no existe.'});
            return;
        }
        if(!puedeOperarSobre(req, asistencia.operador_id)){
            res.status(403).json({ message:'No puedes ver las actividades de otro trabajador.'});
            return;
        }

        const registros = await RegistroActividad.findAll({
            where: { asistencia_id:Number(asistenciaId)},
            include:[
                {model: Equipo, as:'equipo'},
                {model: Actividad, as:'actividad'},
                {model: Seccion, as: 'seccion'},
            ],
            order: [['hora_inicio','ASC']],
        });

        res.json(registros);

    } catch(err){
        res.status(500).json({ message: 'Error al obtener los registros de actividad.',err});

    }
};