import { Request, Response } from 'express';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Op } from 'sequelize';

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
        const { operador_id } = req.body;
        const operador = await Operador.findByPk(Number(operador_id));
        if(!operador){
            res.status(404).json({message:"Operador no registrado en el sistema"});
            return;
        }

        //formato fecha actual yyyy-mm-dd
        const hoy = new Date().toISOString().split('T')[0]!;

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
                estado: 'PRESENTE',
            });
            res.json({
                tipo:'ENTRADA',
                message: `Bienvenido! Entrada registrada a las ${ahora.toLocaleTimeString('es-EC')}`,
                operador: operador.nombre_completo,
                asistencia,
            });
        } else if(asistencia.estado === 'PRESENTE'){
            //Caso 2: Ya ingreso hoy -> Registrar Salida
            await asistencia.update({
                hora_salida:ahora,
                estado:'FINALIZADO',
            });

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
        res.status(500).json({message:'Error procesando mar QR',err});
    }
};

//Obtener reporte diario de asistencia
export const obtenerAsistenciaHoy = async(_req:Request, res:Response):Promise<void> =>{
    try{
        const hoy = new Date().toISOString().split('T')[0];
        const asistencias = await Asistencia.findAll({
            where: { fecha:hoy },
            include: [{ model: Operador, as:'operador'}],
            order: [['hora_ingreso','DESC']],
        });
        res.json(asistencias);
    } catch(error){
        res.status(500).json({message:'Error al obtener asustencias', error});
    }
}