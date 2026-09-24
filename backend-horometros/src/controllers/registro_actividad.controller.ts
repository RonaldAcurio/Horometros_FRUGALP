import { Request, Response } from "express";
import { Op } from "sequelize";
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
        const { asistencia_id, equipo_id, actividad_id, area, seccion_id, observaciones, hora_inicio } = req.body;
        if(!asistencia_id || !equipo_id || !actividad_id){
            res.status(400).json({ message:'asistencia_id, equipo_id y actividad_id son obligatios.'});
            return;
        }

        /*
        hora_inicio es OPCIONAL y editable: el trabajador puede estar registrando la labor en su tiempo libre,
        despues de haberla hecho, asi que necesita poder decir "esto lo hice a tal hora" en vez de que el sistema
        le imponga el momento exacto del clic. Si no la manda, se usa el momento actual (comportamiento de antes).
        */
        let horaInicioFinal = new Date();
        if(hora_inicio){
            const parseada = new Date(hora_inicio);
            if(isNaN(parseada.getTime())){
                res.status(400).json({ message: 'hora_inicio no es una fecha valida.'});
                return;
            }
            horaInicioFinal = parseada;
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
            hora_inicio: horaInicioFinal,
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
        const { observaciones, hora_fin } = req.body;

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

        // hora_fin tambien es OPCIONAL y editable, mismo motivo que hora_inicio en crearRegistroActividad.
        let horaFinFinal = new Date();
        if(hora_fin){
            const parseada = new Date(hora_fin);
            if(isNaN(parseada.getTime())){
                res.status(400).json({ message: 'hora_fin no es una fecha valida.'});
                return;
            }
            if(parseada.getTime() <= registro.hora_inicio.getTime()){
                res.status(400).json({ message: 'hora_fin debe ser posterior a la hora de inicio de la labor.'});
                return;
            }
            horaFinFinal = parseada;
        }

        await registro.update({
            hora_fin: horaFinFinal,
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

        // paranoid:false: si el Equipo/Actividad de esta labor fue eliminado (soft-delete) despues de
        // registrarla, la jornada abierta tiene que seguir mostrando con que trabajo, no perder el dato.
        const registros = await RegistroActividad.findAll({
            where: { asistencia_id:Number(asistenciaId)},
            include:[
                {model: Equipo, as:'equipo', paranoid: false},
                {model: Actividad, as:'actividad', paranoid: false},
                {model: Seccion, as: 'seccion', paranoid: false},
            ],
            order: [['hora_inicio','ASC']],
        });

        res.json(registros);

    } catch(err){
        res.status(500).json({ message: 'Error al obtener los registros de actividad.',err});

    }
};

/*
Historial de labores de UN operador a traves de VARIAS jornadas (a diferencia de obtenerRegistrosPorAsistencia,
que es de una sola) - lo usa el reporte imprimible "Ver/Imprimir" del Panel de Asistente (Directorio de
Operadores), que muestra el mismo diseno que la hoja fisica "REPORTES DE LABORES DIARIOS". Rango de fechas
opcional para no traer toda la vida laboral del trabajador de una sola vez.
*/
export const obtenerRegistrosPorOperador = async (req:Request, res:Response):Promise<void> => {
    try{
        const operadorId = req.query['operador_id'];
        if(!operadorId){
            res.status(400).json({ message:'El parametro operador_id es obligatorio.'});
            return;
        }
        if(!puedeOperarSobre(req, Number(operadorId))){
            res.status(403).json({ message:'No puedes ver las actividades de otro trabajador.'});
            return;
        }

        const { fecha_inicio, fecha_fin } = req.query;
        const whereAsistencia: Record<string, unknown> = { operador_id: Number(operadorId) };
        if(fecha_inicio || fecha_fin){
            const rangoFecha: Partial<Record<typeof Op.gte | typeof Op.lte, unknown>> = {};
            if(fecha_inicio) rangoFecha[Op.gte] = fecha_inicio;
            if(fecha_fin) rangoFecha[Op.lte] = fecha_fin;
            whereAsistencia.fecha = rangoFecha;
        }

        // paranoid:false: mismo motivo que en obtenerRegistrosPorAsistencia - este es el reporte imprimible
        // "Ver/Imprimir" (Directorio/Historial), no puede perder equipo/actividad si luego se eliminaron.
        const registros = await RegistroActividad.findAll({
            include:[
                {model: Equipo, as:'equipo', paranoid: false},
                {model: Actividad, as:'actividad', paranoid: false},
                {model: Seccion, as: 'seccion', paranoid: false},
                {model: Asistencia, as: 'asistencia', where: whereAsistencia, attributes: ['id','fecha','operador_id']},
            ],
            order: [[{ model: Asistencia, as: 'asistencia' }, 'fecha', 'ASC'], ['hora_inicio','ASC']],
        });

        res.json(registros);

    } catch(err){
        res.status(500).json({ message: 'Error al obtener el historial de labores del operador.', err});
    }
};