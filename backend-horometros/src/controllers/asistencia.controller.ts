import { Request, Response } from 'express';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Actividad } from '../models';
import { Op, literal } from 'sequelize';
import { AsistenciaActividad } from '../models';

/*
Columnas que excluimos de los LISTADOS (hoy/historial): la foto pesa decenas/cientos de KB en Base64, y si el supervisor tiene
70 registros en pantalla no tiene sentido bajarlas todas de una. 
En su lugar mandamos "tiene_fot" (un booleano liviano) y la foto real se pide aparte, solo cuando el usuario hace clic en "ver-Evidencia"
(ver obtenerFotoAsistencia).
*/
const ATRIBUTOS_SIN_FOTO = {
    exclude: ['foto_ingreso'],
    include: [[literal('"foto_ingreso" IS NOT NULL'), 'tiene_foto']] as any,
};

//funcion auxiliar para obtener la decha 'YYYY-MM-DD' en la zona horario de Ecuador
const getFetchLocalEcuador = ():string => {
    return new Date().toLocaleDateString('sv-SE',{timeZone: 'America/Guayaquil'});
};

//Crear un Nuevo Operador
export const crearOperador = async (req:Request, res:Response):Promise<void> => {
    try{

        const { nombre_completo, codigo_megued, cedula, telefono, direccion } = req.body;
        if(!nombre_completo || !codigo_megued){
            res.status(400).json({message:'El nombre completo y el codigo son obligatorios'});
            return;
        }

        const nuevoOperador = await Operador.create({
            nombre_completo,
            codigo_megued,
            cedula,
            telefono,
            direccion
        });

        res.status(201).json(nuevoOperador);
    }
    catch(err){
        res.status(500).json({message:'Error al crear el operador',err});
    }
}

//Actualizamos la Informacion personal del Operador
export const actualizarOperador = async (req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { cedula, telefono, direccion } = req.body;

        const operador = await Operador.findByPk(Number(id));
        if(!operador){
            res.status(404).json({message: 'Operador no encontrado'});
            return;
        }

        await operador.update({ cedula, telefono, direccion});
        res.json({message:"Operador actualizado exitosamente", operador});
    } 
    catch(err){
        res.status(404).json({message: 'Error al actualizar el operador', err});
    }
};

//Obtener la lista de operadores
export const obtenerOperadores = async(_req: Request, res:Response):Promise<void> => {
    try{
        const operadores = await Operador.findAll({ order: [['nombre_completo','ASC']]});
        res.json(operadores);
    } catch(err){
        res.status(500).json({message:'Error al obtener operdadores',err});
    }
};

//Logica de Marcacion con Escaner QR (Entrada/Salida)
export const registrarMacarcoQR= async(req:Request, res:Response):Promise<void> => {
    try{
        const { operador_id, actividades_ids, foto_ingreso, observaciones } = req.body;

        const operador = await Operador.findByPk(Number(operador_id));
        if(!operador){
            res.status(404).json({message:"Operador no registrado en el sistema"});
            return;
        }

        const ahora = new Date();

        /*
        Pasa 1= tienes una jornada ABIERTA(EN_JORNADA), sin importar la fecha en que empezo?
        ESto es lo que permite cerrar correctamente turnos que cruzan la medianoche (entra 10pm, sale 6am del dia sigueiente):
        la salida cierra ESA marca puntual, no depende de que la fecha calendario siga siendo la misma
        */

        let asistencia = await Asistencia.findOne({
            where:{
                operador_id: operador.id,
                estado: 'EN_JORNADA'
            },
        });

        if(asistencia){
            //Tiene una jornada abierta -> este escaneo es una SALIDA (exigimos actividad)
            const actividadesIds:number[] = Array.isArray(actividades_ids) ? actividades_ids.map(Number) : [];

            if(actividadesIds.length === 0){
                res.status(400).json({
                    message:"Es obligatorio seleccionar al menos una actividad para registrar la salida.",
                    require_actividad: true
                });
                return;
            }

            // Validar que la actividad exista y NO este eliminada(Soft Delete)
            const actividadExistente = await Actividad.findAll({where: { id: actividadesIds}});
            if(actividadExistente.length !== actividadesIds.length){
                res.status(404).json({ message:'Una o mas actividades seleccionadas no existen o estan inactivas'});
                return;
            }

            await asistencia.update({
                hora_salida:ahora,
                estado:'PENDIENTE_REVISION',
            });

            //Insertamos el detalle de actividades en la tabla pivote (relacion muchos a muchos)
            await AsistenciaActividad.bulkCreate(
                actividadesIds.map((actividad_id) => ({
                    asistencia_id: asistencia!.id,
                    actividad_id,
                }))
            );

            res.json({
                tipo: 'SALIDA',
                message:`Hasta Luego! Salida registrada a las ${ahora.toLocaleTimeString('es-EC')}`,
                operador: operador.nombre_completo,
                asistencia,
            });

            return;

        }
        /*
        Paso 2: no tiene ninguna jornada abierta. Antes de crear una ENTRADA nueva, verificamos si HOY (decha calendario)
        ya completo un turno completo, para mantener la regla de "una jornada por dia" (evita reingresos multiples el mismo dia).
        */
        const hoy = getFetchLocalEcuador();
        const asistenciaHoy = await Asistencia.findOne({
            where: {operador_id: operador.id, fecha: hoy},
        });
        if(asistenciaHoy){
            /*
            ya tiene creado un registro de hoy y no esta EN_JORNADA (ya lo descartamos en el paso 1)
            ya completo su jornada laboral de hoy.
            */
           res.status(400).json({
            message: `El operador ${operador.nombre_completo} ya completo su jornada laboral de hoy.`,
           });
           return;
        }

        //Paso 3: Entrada Nueva
        asistencia = await Asistencia.create({
                operador_id: operador.id,
                fecha: hoy,
                hora_ingreso: ahora,
                estado: 'EN_JORNADA',
                foto_ingreso: foto_ingreso || null,
            });
            res.json({
                tipo:'ENTRADA',
                message: `Bienvenido! Entrada registrada a las ${ahora.toLocaleTimeString('es-EC')}`,
                operador: operador.nombre_completo,
                asistencia,
            });

    } catch(err){
        res.status(500).json({message:'Error procesando marca QR',err});
    }
};

//Obtener reporte diario de asistencia
export const obtenerAsistenciaHoy = async(req:Request, res:Response):Promise<void> =>{
    try{
        //Si viene fecha por query la usamos de lo contrario usamos la fecha local
        const fechaQuery = req.query['fecha'] as string;
        const hoy = fechaQuery || getFetchLocalEcuador();
        //Paginacion: misma logica que el Historial, para que el Supervisor tampoco le llegue de golpe toda la lista del dia
        const paginaActual = Math.max(1, Number(req.query['pagina']) || 1);
        const limitePagina = Math.min(100, Math.max(1, Number(req.query['limite']) || 30));
        const offset = (paginaActual - 1) * limitePagina;

        const { rows:asistencias, count:total } = await Asistencia.findAndCountAll({
            where: { fecha:hoy },
            attributes: ATRIBUTOS_SIN_FOTO,
            include: [
                { model: Operador, as:'operador'},
                { model: Actividad, as:'actividad'},
                { model: Actividad, as:'actividades'},
            ],
            order: [['hora_ingreso','DESC']],
            limit: limitePagina,
            offset,
            /*
            El include de 'actividades' es un JOIN muchos-a-muchos: sin 'distrinct el count quedaria inflaso (una vez por cada actividad
            vinculada, no por registro).'
            */
           distinct: true
        });
        /*
        El "dia cerrado" se calcula sobre TODOS los registros del dia, no solo la pagina visible- si no, el boton "CERRAR JORNADA" quedaria
        hanilitado/deshabilido segun que pagina este mirando el supervisor, en vez del estado real del dia completo.
        */
       const totalAbiertos = await Asistencia.count({
        where: {
            fecha: hoy,
            estado: { [Op.in]: ['EN_JORNADA','PENDIENTE_REVISION']},
        },
       });
       const diaCerrado = total > 0 && totalAbiertos === 0;

        res.json({
            data: asistencias,
            total,
            pagina:paginaActual,
            totalPaginas: Math.ceil(total / limitePagina) || 1,
            diaCerrado,
        });
    } catch(error){
        res.status(500).json({message:'Error al obtener asustencias', error});
    }
};

// Cierre de jornada ejecutando por el Supervisor
export const finalizarDia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { fecha } = req.body;
        const fechaProcesar = fecha || getFetchLocalEcuador();

        /*
        Verificamos el estado actual de la jornada antes de tocar nada: si ya queda ningun registro pendiente
        de revision, es por que el dia ya fue cerrado antes.
        */
       const registroDelDia = await Asistencia.findAll({ where: {fecha: fechaProcesar}});
        if(registroDelDia.length === 0 ){
            res.status(404).json({
                message:`No hay marcaciones registradas para el ${fechaProcesar}.`
            });
            return;
        }

        const quedanPendientes = registroDelDia.some(
            (r) => r.estado == 'EN_JORNADA' || r.estado === 'PENDIENTE_REVISION'
        );
        if(!quedanPendientes){
            res.status(400).json({
                message:`La jornada del ${fechaProcesar} ya fue cerrada anteriormente.`,
                ya_cerrado : true
            });
            return;
        }

        // 1.Aprobar marcaciones en PENDIENTE_REVISION -> FINALIZADO
        const [aprobados] = await Asistencia.update(
            { estado: 'FINALIZADO'},
            {
                where:{
                    fecha: fechaProcesar,
                    estado: 'PENDIENTE_REVISION'
                }
            }
        );

        // 2. Marcar operadores olvidados (se quedaron en EN_JORNADA) -> SALIDA_OLVIDADA
        const [olvidados] = await Asistencia.update(
            {estado:'SALIDA_OLVIDADA'},
            {
                where:{
                    fecha: fechaProcesar,
                    estado: 'EN_JORNADA'
                }
            }
        );

        res.json({
            message: `Jornada del ${fechaProcesar} cerrada con exito.`,
            resumen: {
                registros_finalizados: aprobados,
                salidas_olvidadas: olvidados
            }
        });

    }catch(err){
        res.status(500).json({ message: 'Error al ejecutar el cierre del dia', err});
    }
};

// Historial con filtros opcionales de fechas
export const obtenerHistorial = async(req:Request, res:Response):Promise<void> => {
    try{
        const { fecha_inicio, fecha_fin, operador_id } = req.query;
        const whereCondition:any = {};

        // Filtro por rango de fecha
        if(fecha_inicio && fecha_fin){
            whereCondition.fecha = {
                [Op.between]:[String(fecha_inicio), String(fecha_fin)]
            };
        } else if(fecha_inicio){
            whereCondition.fecha = String(fecha_inicio);
        }

        // Filtro opcional por operador
        if(operador_id){
            whereCondition.operador_id = Number(operador_id);
        }

        /*
        El Historial de Asistencia es la auditoria OFICIAL: solo debe mostrar jornadas que el supervisor ya reviso y cerro(FINALIZADO/SALIDA_OLVIDADA),
        nunca marcaciones todavia en curso (EN_JORNADA) o pendiente de revision (PENDIENTE_REVISION).
        */
        whereCondition.estado = { [Op.in] : ['FINALIZADO','SALIDA_OLVIDADA']};

        /*
        Paginacion: sin esto, un filtro de "todo el ano" intentaria devolver miles de registros (con sus fotos, si no los hubieramos excluido arriba)
        en una sola respuesta.
        */
       const paginaActual = Math.max(1, Number(req.query['pagina']) || 1);
       const limitePagina = Math.min(100, Math.max(1, Number(req.query['limite']) || 30));
       const offset = (paginaActual -1) * limitePagina;

        const { rows:historial, count:total } = await Asistencia.findAndCountAll({
            where: whereCondition,
            attributes:ATRIBUTOS_SIN_FOTO,
            include:[
                { model: Operador, as: 'operador' },
                { model: Actividad, as: 'actividad' },
                { model: Actividad, as: 'actividades'},
            ],
            order: [['fecha','DESC'],['hora_ingreso','DESC']],
            limit: limitePagina,
            offset,
            //El include de 'actividades' es un JOIN muchos-a-muchos: sin 'distinct' el count quedaria inflado (cuenta una vez por cada actividad
            //vinculada, no por registro).
            distinct: true,
        });

        //Calculamos las horas trabajadas de cada registro(campo derivado, no vive en la BD)
        const historialConHoras = historial.map((registro) => {
            const datos = registro.toJSON() as any;
            let total_horas: number | null = null;

            if(datos.hora_ingreso && datos.hora_salida){
                const milisegundos = new Date(datos.hora_salida).getTime() - new Date(datos.hora_ingreso).getTime();

                total_horas = Math.round((milisegundos / (1000 *60 * 60)) * 100) / 100;
            }

            return {...datos, total_horas};
        });

        res.json({
            data: historialConHoras,
            total,
            pagina: paginaActual,
            totalPaginas: Math.ceil(total / limitePagina) || 1,
        });

    } catch(err){
        res.status(500).json({ message: 'Error al consultar el historial del asistencia', err});
    }
};

/*
Devuelve UNICAMENTE la foto de un registro puntual. Sellama recien cuando el usuario hace click en "Ver Evidencia" (ver ATRIBUTOS_SIN_FOTO): asi los listados
(hoy/historial) nunca cargan fotos que nadie pidio ver
*/
export const obtenerFotoAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;

        const asistencia = await Asistencia.findByPk(Number(id), {
            attributes: ['id', 'foto_ingreso'],
        });
        if(!asistencia){
            res.status(404).json({ message: 'Registro de asistencia no encontrado.'});
            return;
        }

        if(!asistencia.foto_ingreso){
            res.status(404).json({ message: 'Este registro no tiene foto de evidencia.'});
            return;
        }

        res.json({ foto_ingreso: asistencia.foto_ingreso });

    } catch(err){
        res.status(500).json({ message: 'Error al obtener la foto de evidencia.', err});
    }
}

//Edicion/Revision por parte del Supervisor(Ajustes de hora, estado u observacciones)
export const revisarAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{

        const { id } = req.params;
        const { hora_salida, observaciones, estado, actividad_id } = req.body;

        const asistencia = await Asistencia.findByPk(Number(id));
        if(!asistencia){
            res.status(404).json({ message: "Registro de asistencia no encontrado."});
            return;
        }

        /*
        Datos congelados: una vez que el Supervisor cerro la jornada (FINALIZADO/SALIDA_OLVUDADA) este registro
        ya no se puede modificar, ni siquiera la observacion.
        */
       if(asistencia.estado === 'FINALIZADO' || asistencia.estado === 'SALIDA_OLVIDADA'){
        res.status(400).json({
            message:'Este registro ya fue cerrado y no se puede modificar.'
        });
        return;
       }

        await asistencia.update({
            hora_salida: hora_salida ?? asistencia.hora_salida,
            observaciones: observaciones ?? asistencia.observaciones,
            estado: estado ?? asistencia.estado,
            actividad_id: actividad_id ? Number(actividad_id) : asistencia.actividad_id,
        });

        res.json({
            message:"Asistencia actualizada por el supervisor.",
            asistencia
        });

    }catch(err){
        res.status(500).json({ message:"Error al revisar la asistencia.",err });

    }
}