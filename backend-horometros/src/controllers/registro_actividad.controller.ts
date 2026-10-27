import { Request, Response } from "express";
import { Op } from "sequelize";
import { RegistroActividad } from "../models/registro_actividad";
import { Asistencia } from "../models/asistencias";
import { Equipo } from "../models/equipo";
import { Actividad } from "../models/actividad";
import { Seccion } from "../models/seccion";
import { Operador } from "../models/operador";
import { horaEsAnteriorARegistrosPrevios } from "../utils/validar-orden-horas";
import { calcularDiaCerradoDeAsistencia } from "./asistencia.controller";

/*
ADMIN/SUPERVISOR actuando sobre la jornada de OTRO (nunca el propio operador, ver abajo) desde el Panel de
Supervisor (pedido del usuario, 2026-10-21): pueden seguir agregando/editando/eliminando labores de un
trabajador aunque su jornada ya no siga EN_JORNADA (se le olvido marcar salida, ya marco, etc.) - mientras el
DIA no haya cerrado de verdad con "Cerrar Jornada" (ver calcularDiaCerradoDeAsistencia). ASISTENTE queda
afuera a proposito, aunque puedeOperarSobreAsistencia ya le de permiso irrestricto sobre estas 4 funciones -
ASISTENTE nunca entra al Panel de Supervisor (ver app.routes.ts, roleGuard) y nunca pidio esta capacidad, asi
que se le cierra la puerta tambien aca, no solo en la pantalla. Un OPERADOR en su propia jornada (mi-jornada.ts)
nunca pasa por aca: req.auth.tipo siempre es 'usuario' para quien SI puede forzar.
*/
const puedeForzarComoSupervisor = (req: Request): boolean =>
    req.auth?.tipo === 'usuario' && (req.auth.rol === 'ADMIN' || req.auth.rol === 'SUPERVISOR');

/*
Un trabajador marcado OBSERVANDO (la X del Supervisor, "no vino") YA NO queda afuera de esta excepcion
(pedido del usuario, 2026-10-27): O/X pasa a ser solo un contador para poder cerrar la jornada (ver
finalizarDia en asistencia.controller.ts), no un bloqueo de permisos - el Supervisor necesita poder seguir
agregando/editando/eliminando labores (equipo/actividad) de alguien marcado ausente, igual que ya puede
hacerlo con FINALIZADO/SALIDA_OLVIDADA desde el 2026-10-21.
*/
const puedeForzarEnEstaAsistencia = async (req: Request, asistencia: Asistencia): Promise<boolean> =>
    puedeForzarComoSupervisor(req)
    && !(await calcularDiaCerradoDeAsistencia(asistencia));

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

        if(asistencia.estado !== 'EN_JORNADA' && !(await puedeForzarEnEstaAsistencia(req, asistencia))){
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

        /*
        Si no viene seccion_id en el body, se hereda la Seccion FIJA del propio trabajador (Operador.seccion_id,
        pedido del usuario 2026-10-12) - asi no se le pide elegirla en cada labor, solo una vez al crear su
        cuenta. Si tampoco la tiene asignada (cuenta vieja, de antes de este cambio), queda en null, igual que
        siempre.
        */
        let seccionIdFinal: number | null = null;
        if(seccion_id){
            const seccion = await Seccion.findByPk(Number(seccion_id));
            if(!seccion){
                res.status(404).json({ message:'La seccion indicada no existe.'});
                return;
            }
            seccionIdFinal = seccion.id;
        } else {
            const operador = await Operador.findByPk(asistencia.operador_id, { attributes: ['seccion_id'] });
            seccionIdFinal = operador?.seccion_id ?? null;
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
            seccion_id: seccionIdFinal,
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
            /*
            SOLO rechaza si queda ANTES de hora_inicio (<), nunca si cae en el mismo instante (bug real
            encontrado en pruebas e2e, 2026-10-05): el frontend arma estas horas con dos inputs HH/MM, sin
            segundos (ver horaComponentesAIso, mi-jornada.ts) - una labor corta que arranca y se cierra dentro
            del MISMO minuto de reloj llega aca con hora_inicio y hora_fin truncadas al mismo segundo exacto
            (:00), aunque en el tiempo real hora_fin si vino despues. Con <= (antes) esto se rechazaba siempre
            con "hora_fin debe ser posterior", bloqueando cualquier labor de menos de un minuto - un caso
            perfectamente valido (ej. una tarea rapida), no un error de captura.
            */
            if(parseada.getTime() < registro.hora_inicio.getTime()){
                res.status(400).json({ message: 'hora_fin no puede ser anterior a la hora de inicio de la labor.' });
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

/*
Busca cual es la ULTIMA labor registrada en una jornada (la de hora_inicio mas tardia; 'id' como desempate
para el caso raro de 2 labores con la misma hora_inicio exacta, ya que el id autoincremental si refleja el
orden real de creacion). La usa eliminarRegistroActividad para no confiar nunca en lo que mande el frontend -
el boton "Eliminar" solo deberia aparecer en pantalla sobre la ultima fila, pero el backend vuelve a
confirmarlo por su cuenta antes de borrar nada.
*/
const esUltimaLaborDeLaJornada = async (asistenciaId: number, registroId: number): Promise<boolean> => {
    const ultima = await RegistroActividad.findOne({
        where: { asistencia_id: asistenciaId },
        order: [['hora_inicio', 'DESC'], ['id', 'DESC']],
    });
    return ultima?.id === registroId;
};

/*
Editar una labor ya registrada (pedido del usuario, 2026-10-16: corregir un equipo/actividad/observacion mal
elegidos, sin tener que borrar y re-crear todo). Para el trabajador editando su PROPIA jornada, sigue siendo
estructuralmente imposible mover hora_inicio/hora_fin - ni se leen del body en ese caso (lo unico que podria
desordenar "Labores de hoy", ver horaEsAnteriorARegistrosPrevios). Excepcion (pedido del usuario, 2026-10-21):
si puedeForzarEnEstaAsistencia es true (ADMIN/SUPERVISOR editando desde el Panel de Supervisor), SI se leen y
aplican - ahi la unica validacion es que hora_fin no quede antes de hora_inicio, sin comparar contra las demas
labores del dia (es justo la herramienta para corregir ese desorden a mano).
*/
export const editarRegistroActividad = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { equipo_id, actividad_id, area, seccion_id, horometro_inicio, horometro_final, observaciones, hora_inicio, hora_fin } = req.body;

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

        const puedeForzar = await puedeForzarEnEstaAsistencia(req, asistencia);

        if(asistencia.estado !== 'EN_JORNADA' && !puedeForzar){
            res.status(400).json({ message: 'Esta jornada ya no esta activa: no se pueden editar sus labores.'});
            return;
        }

        let horaInicioFinal = registro.hora_inicio;
        let horaFinFinal = registro.hora_fin;
        if(puedeForzar){
            if(hora_inicio !== undefined){
                const parseada = new Date(hora_inicio);
                if(isNaN(parseada.getTime())){
                    res.status(400).json({ message: 'hora_inicio no es una fecha valida.'});
                    return;
                }
                horaInicioFinal = parseada;
            }
            if(hora_fin !== undefined){
                if(hora_fin === null || hora_fin === ''){
                    horaFinFinal = null;
                } else {
                    const parseada = new Date(hora_fin);
                    if(isNaN(parseada.getTime())){
                        res.status(400).json({ message: 'hora_fin no es una fecha valida.'});
                        return;
                    }
                    horaFinFinal = parseada;
                }
            }
            if(horaFinFinal && horaFinFinal.getTime() < horaInicioFinal.getTime()){
                res.status(400).json({ message: 'hora_fin no puede ser anterior a hora_inicio.' });
                return;
            }
        }

        let equipoIdFinal = registro.equipo_id;
        if(equipo_id !== undefined){
            const equipo = await Equipo.findByPk(Number(equipo_id));
            if(!equipo){
                res.status(404).json({ message:'El equipo indicado no existe.'});
                return;
            }
            equipoIdFinal = equipo.id;
        }

        let actividadIdFinal = registro.actividad_id;
        if(actividad_id !== undefined){
            const actividad = await Actividad.findByPk(Number(actividad_id));
            if(!actividad){
                res.status(404).json({ message:'La actividad indicada no existe o esta inactiva.'});
                return;
            }
            actividadIdFinal = actividad.id;
        }

        let seccionIdFinal = registro.seccion_id;
        if(seccion_id !== undefined){
            if(seccion_id === null || seccion_id === ''){
                seccionIdFinal = null;
            } else {
                const seccion = await Seccion.findByPk(Number(seccion_id));
                if(!seccion){
                    res.status(404).json({ message:'La seccion indicada no existe.'});
                    return;
                }
                seccionIdFinal = seccion.id;
            }
        }

        await registro.update({
            equipo_id: equipoIdFinal,
            actividad_id: actividadIdFinal,
            area: area !== undefined ? (area || null) : registro.area,
            seccion_id: seccionIdFinal,
            horometro_inicio: horometro_inicio !== undefined
                ? (horometro_inicio !== null && horometro_inicio !== '' ? Number(horometro_inicio) : null)
                : registro.horometro_inicio,
            horometro_final: horometro_final !== undefined
                ? (horometro_final !== null && horometro_final !== '' ? Number(horometro_final) : null)
                : registro.horometro_final,
            observaciones: observaciones !== undefined ? (observaciones || null) : registro.observaciones,
            hora_inicio: horaInicioFinal,
            hora_fin: horaFinFinal,
        });

        // Recarga con los catalogos (equipo/actividad) para que el frontend pueda repintar la fila sin pedir
        // de nuevo toda la lista - mismo patron que finalizarRegistroActividad.
        await registro.reload({
            include: [
                { model: Equipo, as: 'equipo' },
                { model: Actividad, as: 'actividad' },
                { model: Seccion, as: 'seccion' },
            ],
        });

        res.json({ message: 'Labor actualizada correctamente.', registro });

    }catch(err){
        console.error('Error al editar el registro de actividad.', err);
        res.status(500).json({ message: 'Error al editar el registro de actividad.' });
    }
};

/*
Eliminar una labor (pedido del usuario, 2026-10-16: "me equivoque por completo, quiero borrar esto"). Borrado
FISICO a proposito (decision explicita del usuario, sin soft-delete): equipo_id/actividad_id son llaves
FORANEAS que APUNTAN a 'equipos'/'actividades' (la labor apunta al catalogo, nunca al reves), asi que borrar
esta fila jamas toca el Equipo/Actividad del catalogo - siguen disponibles para cualquier otra labor de
cualquier otro trabajador, sin importar cuantas veces se borre esta.

SOLO se puede eliminar la ULTIMA labor de la jornada (ver esUltimaLaborDeLaJornada) - asi nunca se abre un
hueco en medio de "Labores de hoy": borrar siempre achica la lista desde el final, el mismo lugar por donde
siempre se agranda al crear. El backend verifica esto por su cuenta, nunca confia en que el boton de la
pantalla solo aparezca ahi.
*/
export const eliminarRegistroActividad = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;

        const registro = await RegistroActividad.findByPk(Number(id));
        if(!registro){
            res.status(404).json({ message:'Registro de actividad no encontrado.'});
            return;
        }

        const asistencia = await Asistencia.findByPk(registro.asistencia_id);
        if(!asistencia || !(await puedeOperarSobreAsistencia(req, asistencia))){
            res.status(403).json({ message:'No puedes eliminar la actividad de otro trabajador.'});
            return;
        }

        const puedeForzar = await puedeForzarEnEstaAsistencia(req, asistencia);

        if(asistencia.estado !== 'EN_JORNADA' && !puedeForzar){
            res.status(400).json({ message: 'Esta jornada ya no esta activa: no se pueden eliminar sus labores.'});
            return;
        }

        /*
        'forzar' (pedido del usuario, 2026-10-21): salta UNICAMENTE el chequeo de "ultima labor" de abajo, para
        que ADMIN/SUPERVISOR puedan limpiar labores duplicadas/mal registradas sin importar su posicion en la
        jornada - nunca tiene efecto si puedeForzar es false (un trabajador que mande forzar:true a mano sobre
        su propia jornada no consigue nada distinto a lo de siempre).
        req.body || {}: un DELETE sin body (el camino normal) no siempre llega como {} - puede llegar undefined
        segun el cliente, y desestructurar de undefined tira un 500.
        */
        const { forzar } = req.body || {};
        if(!(forzar && puedeForzar) && !(await esUltimaLaborDeLaJornada(registro.asistencia_id, registro.id))){
            res.status(400).json({ message: 'Solo se puede eliminar la última actividad registrada - elimina primero las que quedaron después.' });
            return;
        }

        await registro.destroy();

        res.json({ message: 'Labor eliminada correctamente.' });

    }catch(err){
        console.error('Error al eliminar el registro de actividad.', err);
        res.status(500).json({ message: 'Error al eliminar el registro de actividad.' });
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