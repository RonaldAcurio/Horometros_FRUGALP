import { Request, Response } from "express";
import { Op } from "sequelize";
import { RegistroActividad } from "../models/registro_actividad";
import { Asistencia } from "../models/asistencias";
import { Equipo } from "../models/equipo";
import { Actividad } from "../models/actividad";
import { Seccion } from "../models/seccion";
import { Operador } from "../models/operador";
import { horaEsAnteriorARegistrosPrevios } from "../utils/validar-orden-horas";

/*
Un Mecanico/Operador solo puede tocar su PROPIA jornada. ADMIN/ASISTENTE pueden tocar cualquiera (correcciones,
revision). Un SUPERVISOR real SOLO sobre sus propios operadores (o un trabajador prestado que el mismo admitio
hoy, ver hacienda_prestamo_id) - antes se trataba igual que ADMIN/ASISTENTE, sin ningun chequeo de hacienda
(bug real de la misma auditoria de alcance que ya encontro y confirmo el usuario en asistencia.controller.ts:
un Supervisor podia ver/crear/finalizar labores de operadores de OTRO Supervisor con solo conocer el
asistencia_id). Recibe el objeto Asistencia completo (no solo el operador_id) porque necesita
hacienda_prestamo_id para el caso del trabajador prestado - mismo criterio que
tienePermisoSupervisorSobreAsistencia en asistencia.controller.ts.
*/
const puedeOperarSobreAsistencia = async (req:Request, asistencia: Asistencia): Promise<boolean> => {
    if(!req.auth) return false;
    if(req.auth.tipo === 'operador') return req.auth.id === asistencia.operador_id;
    if(req.auth.rol === 'ADMIN' || req.auth.rol === 'ASISTENTE') return true;
    if(req.auth.rol === 'SUPERVISOR'){
        if(asistencia.hacienda_prestamo_id !== null && asistencia.hacienda_prestamo_id === req.auth.hacienda_id) return true;
        const operador = await Operador.findByPk(asistencia.operador_id, { attributes: ['supervisor_id'] });
        return operador?.supervisor_id === req.auth.id;
    }
    return false;
}

/*
Chequeo de alcance PERMANENTE sobre un operador (no una jornada puntual) - lo usa obtenerRegistrosPorOperador
(historial completo a traves de varias jornadas, "Ver/Imprimir" del Panel de Asistente). Un trabajador
prestado NO cuenta aqui a proposito: prestarlo por un dia no deberia darle a ese Supervisor acceso al
historial de TODA la vida laboral del operador en otras haciendas.
*/
const puedeVerHistorialDeOperador = async (req:Request, operadorId: number): Promise<boolean> => {
    if(!req.auth) return false;
    if(req.auth.tipo === 'operador') return req.auth.id === operadorId;
    if(req.auth.rol === 'ADMIN' || req.auth.rol === 'ASISTENTE') return true;
    if(req.auth.rol === 'SUPERVISOR'){
        const operador = await Operador.findByPk(operadorId, { attributes: ['supervisor_id'] });
        return operador?.supervisor_id === req.auth.id;
    }
    return false;
}

//Crear una nueva labor dentro de la jornada abierta del trabajador (Panel de Actividades)
export const crearRegistroActividad = async(req:Request, res:Response):Promise<void> => {
    try{
        const { asistencia_id, equipo_id, actividad_id, area, seccion_id, horometro_inicio, observaciones, hora_inicio } = req.body;
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

        if(!(await puedeOperarSobreAsistencia(req, asistencia))){
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

        /*
        La hora de inicio de una labor NUEVA no puede quedar antes de la ultima labor ya registrada ese dia (ni
        antes de su inicio si sigue abierta, ni antes de su fin si ya la cerraron) - decision del usuario: evita
        que la lista de "Labores de hoy" quede desordenada/inconsistente en el tiempo. Se compara contra TODAS
        las labores de esta jornada, no solo la ultima creada, por si el trabajador cierra una labor fuera de
        orden.
        */
        const registrosPrevios = await RegistroActividad.findAll({
            where: { asistencia_id: asistencia.id },
            attributes: ['hora_inicio', 'hora_fin'],
        });
        if(horaEsAnteriorARegistrosPrevios(horaInicioFinal, registrosPrevios)){
            res.status(400).json({ message: 'La hora de inicio no puede ser anterior a la ultima labor ya registrada hoy.' });
            return;
        }

        const registro = await RegistroActividad.create({
            asistencia_id: asistencia.id,
            equipo_id: equipo.id,
            actividad_id: actividad.id,
            area: area || null,
            seccion_id: seccion_id ? Number(seccion_id) : null,
            horometro_inicio: horometro_inicio !== undefined && horometro_inicio !== null && horometro_inicio !== '' ? Number(horometro_inicio) : null,
            observaciones: observaciones || null,
            hora_inicio: horaInicioFinal,
        });
        
        res.status(201).json(registro);

    }catch(err){
        console.error('Error al crear el registro de actividad.', err);
        res.status(500).json({ message: 'Error al crear el registro de actividad.' });

    }
};

//Cerrar una labor ya iniciada(marcar hora_fin y permite ajustar observaciones al cerrar)
export const finalizarRegistroActividad = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { observaciones, hora_fin, horometro_final } = req.body;

        const registro = await RegistroActividad.findByPk(Number(id));
        if(!registro){
            res.status(404).json({ message:'Registro de actividad no encontrado.'});
            return;
        }

        const asistencia = await Asistencia.findByPk(registro.asistencia_id);
        if(!asistencia || !(await puedeOperarSobreAsistencia(req, asistencia))){
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
            horometro_final: horometro_final !== undefined && horometro_final !== null && horometro_final !== '' ? Number(horometro_final) : registro.horometro_final,
            observaciones: observaciones ?? registro.observaciones,
        });

        res.json({ message: 'Labor fibalizada correctamente.',registro });

    }catch(err){
        console.error('Error al finalizar el registro de actividad.', err);
        res.status(500).json({ message: 'Error al finalizar el registro de actividad.' });

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
        if(!(await puedeOperarSobreAsistencia(req, asistencia))){
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
        console.error('Error al obtener los registros de actividad.', err);
        res.status(500).json({ message: 'Error al obtener los registros de actividad.' });

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
        if(!(await puedeVerHistorialDeOperador(req, Number(operadorId)))){
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
                // 'observaciones' agregado (pedido del usuario, 2026-10-01): la hoja imprimible "Imprimir
                // Hojas del rango" necesita el pie "Observaciones del Supervisor" de CADA dia por separado
                // (antes solo viajaba en el camino de un solo dia, ver obtenerAsistenciaHoy/obtenerHistorial).
                {model: Asistencia, as: 'asistencia', where: whereAsistencia, attributes: ['id','fecha','operador_id','observaciones']},
            ],
            order: [[{ model: Asistencia, as: 'asistencia' }, 'fecha', 'ASC'], ['hora_inicio','ASC']],
        });

        res.json(registros);

    } catch(err){
        console.error('Error al obtener el historial de labores del operador.', err);
        res.status(500).json({ message: 'Error al obtener el historial de labores del operador.' });
    }
};