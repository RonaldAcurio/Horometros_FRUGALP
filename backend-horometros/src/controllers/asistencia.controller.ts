import { Request, Response } from 'express';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Actividad } from '../models';
import { Op } from 'sequelize';
import { AsistenciaActividad } from '../models';

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

        //formato fecha actual local Ecuador yyyy-mm-dd
        const hoy = getFetchLocalEcuador();

        //Buscar si ya marco ingreso el dia de hoy
        let asistencia = await Asistencia.findOne({
            where:{
                operador_id: operador.id,
                fecha:hoy
            },
        });

        const ahora = new Date();

        if(!asistencia){
            //Casi:1 No existe marca hoy
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
        } else if(asistencia.estado === 'EN_JORNADA'){
            //Caso 2: Ya ingreso hoy -> Registrar Salida (Exigimos actividad)
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
        } else {
            //Caso 3: Ya registro ENTRADA y FINALIZADA, en la jornada
            res.status(400).json({
                message:`El operador ${operador.nombre_completo} ya completo su jornada laboral hoy.`,
            }); 
        }
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
        const asistencias = await Asistencia.findAll({
            where: { fecha:hoy },
            include: [
                { model: Operador, as:'operador'},
                { model: Actividad, as:'actividad'},
                { model: Actividad, as:'actividades'},
            ],
            order: [['hora_ingreso','DESC']],
        });
        res.json(asistencias);
    } catch(error){
        res.status(500).json({message:'Error al obtener asustencias', error});
    }
};

// Cierre de jornada ejecutando por el Supervisor
export const finalizarDia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { fecha } = req.body;
        const fechaProcesar = fecha || getFetchLocalEcuador();

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

        const historial = await Asistencia.findAll({
            where: whereCondition,
            include:[
                { model: Operador, as: 'operador' },
                { model: Actividad, as: 'actividad' },
                { model: Actividad, as: 'actividades'},
            ],
            order: [['fecha','DESC'],['hora_ingreso','DESC']]
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

        res.json(historialConHoras);

    } catch(err){
        res.status(500).json({ message: 'Error al consultar el historial del asistencia', err});
    }
};

// Edicion/Revision por parte del Supervisor(Ajustes de hora, estado u observacciones)
export const revisarAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{

        const { id } = req.params;
        const { hora_salida, observaciones, estado, actividad_id } = req.body;

        const asistencia = await Asistencia.findByPk(Number(id));
        if(!asistencia){
            res.status(404).json({ message: "Registro de asistencia no encontrado."});
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