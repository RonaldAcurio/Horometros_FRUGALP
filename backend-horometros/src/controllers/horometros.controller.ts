import { Equipo, Operador, Actividad, Ingresos_Semanales } from '../models/index';
import { Request, Response } from 'express';
import { analizarfotoHorometro } from '../services/gemini.service';
import { Op } from 'sequelize';

export async function procesarReporteHorometro(req:Request, res:Response) {
    try{

        if(!req.file){
            return res.status(400).json({exito:false, error:'No se subio ninguna imagen'});
        }

        // 1. Extraer datos del reporte con Gemini
        const datosIA = await analizarfotoHorometro(req.file.buffer, req.file.mimetype);

        if(!datosIA.numero_tractor){
            return res.status(400).json({exito: false, error:'No se pudo identificar el codigo del equipo en la hoja'});
        };

        // 2. Buscar Equipo en BD
        const alertas: string[] = [];
        let requireConfirmation = false;
        let equipoBD:any = null;

        //A. Intentando coincidencias combinando Nombre Maquinaria + Numero de Maquinaria
        if(datosIA.nombre_maquinaria && datosIA.numero_tractor){
            equipoBD = await Equipo.findOne({
                where: {
                    numero_hoja: datosIA.numero_tractor,
                    nombre_maquinaria: {[Op.iLike]: `%${datosIA.nombre_maquinaria}%`}
                }
            });
        }

        // B. Si no lo encuentra por su nombre (o la hoja venia sin nombre escrito), buscar solo por numero de hoja o codigo megued
        if(!equipoBD){
            const coincidencias = await Equipo.findAll({
                where: {
                    [Op.or]:[
                        { numero_hoja: datosIA.numero_tractor },
                        { codigo_megued: datosIA.numero_tractor}
                    ]
                }
            });
            if(coincidencias.length === 1){
                equipoBD = coincidencias[0];
            } else if(coincidencias.length > 1){
                //Hay mas de un equipo con ese mismo numero
                requireConfirmation = true;
                alertas.push(`Ambiguedad de Equipo: El numero '${datosIA.numero_tractor}' coincide con varios equipos (${coincidencias.map(e => e.nombre_equipo).join('|')}). Seleccione el correcto.`);
                //Tomamos el primero por defecto para pre-visualizar
                equipoBD = coincidencias[0];
            }
        }

        //VALIDACION ANTI-NULL: Evita que el codigo colapse mas abajo si no encuentra el equipo
        if(!equipoBD){
            return res.status(404).json({
                exito: false,
                error: `El equipo '${datosIA.nombre_maquinaria || ''} ${datosIA.numero_tractor}' no existe en la base de datos.`
            });
        }

        // 3. Coincidencias flexibles de Operador y Actividad
        let operadorBD:any = null;
        if(datosIA.nombre_operador){
            //limpiamos espacios extras
            const nombreLimpio = datosIA.nombre_operador.trim();
            operadorBD = await Operador.findOne({
                where: {
                    [Op.or]:[
                        {nombre_completo: { [Op.iLike]: `%${nombreLimpio}%`}},
                        {nombre_hoja: { [Op.iLike]: `%${nombreLimpio}%`}}
                    ]
                }
            });
        }

        let actividadBD:any = null;
        if(datosIA.codigo_labor){
            const LaborLimpia = datosIA.codigo_labor.trim();
            actividadBD = await Actividad.findOne({
                where:{
                    [Op.or]:[
                        {codigo_megued: LaborLimpia},
                        {description: { [Op.iLike]: `%${LaborLimpia}%`}}
                    ]
                }
            });
        }

        // 4. Buscar el ultimo ingreso registrado para este equipo
        const ultimoIngreso = await Ingresos_Semanales.findOne({
            where:{ equipo_id: equipoBD.id},
            order: [['FECHA_INGRESO','DESC'],['id','DESC']]
        });

        // 5. Calculos y validaciones de negocio
        const kmInicialHoja = Number(datosIA.km_inicial) || 0;
        const kmFinalHoja = Number(datosIA.km_final) || 0;
        const totalHorasHoja = Number((kmFinalHoja - kmInicialHoja).toFixed(2));

        if(ultimoIngreso){
            // A. Validar discontinuidad de Horometros
            const ultimoKmFinalBD = Number(ultimoIngreso.km_inicial) + Number(ultimoIngreso.total_horas);
            if(kmInicialHoja !== ultimoKmFinalBD){
                alertas.push(`Inconsistencia en Horometros: El ultimo registro en BD fue ${ultimoKmFinalBD}, pero la hoja inicia en ${kmInicialHoja}.`);
                requireConfirmation = true;
            }

            // B. Validar brecha temporal (Salto de dias)
            const fechaUltima = new Date(ultimoIngreso.FECHA_INGRESO);
            const fechaNueva = new Date(datosIA.fecha || Date.now());
            const diferenciaDias = Math.floor((fechaNueva.getTime() - fechaUltima.getTime())/(1000 * 3600 * 24));

            if(diferenciaDias > 7 ) {
                alertas.push(`Salto de fechas: Han pasado ${diferenciaDias} dias del ultimo reporte (${ultimoIngreso.FECHA_INGRESO}). Puede haber hojas faltantes`);
                requireConfirmation = true;
            }
        }

        // 6. Respuesta para pre-visualizar antes de confirmar la insercion
        return res.json({
            exito: true,
            requireConfirmation,
            alertas,
            datosExtraidos: datosIA,
            mapeosBD:{
                equipo:{ id: equipoBD.id, nombre: equipoBD.nombre_equipo, codigo: equipoBD.codigo_megued},
                operador: operadorBD ? { id: operadorBD.id, nombre: operadorBD.nombre_completo} : null,
                actividad: actividadBD ? { id: actividadBD.id, descripcion: actividadBD.description} : null,
            },
            calculos:{
                km_inicial: kmInicialHoja,
                km_Final: kmFinalHoja,
                total_horas: totalHorasHoja
            }
        });

    } catch(error:any){
        console.error('❌ Error en procesosReporteHorometro:',error);
        return res.status(500).json({exito: false, error: error.message || 'Error procesando el reporte'});
    }
}

export async function confirmarIngreso(req:Request, res:Response){
    try{
        const{
            equipo_id,
            operador_id,
            actividad_id,
            seccion,
            km_inicial,
            km_final,
            total_horas,
            fecha
        } = req.body;

        //Validar datos minimos requeridos
        if(!equipo_id || !operador_id || !actividad_id){
            res.status(400).json({
                exito: false,
                error: 'Faltan campos obligatorios (codigo operador, codigo maquinaria y codigo actividad)'
            });
        }

        // Calcular total_horas si no viene en el body
        const horasCalculadas = total_horas !== undefined
            ? Number(total_horas)
            : Number((Number(km_final) - Number(km_inicial)).toFixed(2));
        
        const kmInicialNum = Number(km_inicial) || 0;
        const kmFinalNum = km_final !== undefined ? Number(km_final) : (kmInicialNum + horasCalculadas);

        // 1. Insercion en la tabla 'ingresos_semanales'
        const nuevoIngreso = await Ingresos_Semanales.create({
            equipo_id,
            operador_id,
            actividad_id,
            seccion: seccion || 'GENERAL',
            FECHA_INGRESO: fecha || new Date().toISOString().split('T')[0],
            km_inicial: kmInicialNum,
            total_horas: horasCalculadas,
        });

        // 2. Actualizar el horometro actual del equipo
        await Equipo.update({
            ultimo_km_inicial: kmInicialNum,
            ultimo_real: kmFinalNum,
        },{
            where: {id: equipo_id}
        });

        return res.status(200).json({
            exito:true,
            mensaje:'Ingreso semanal registrado y estado del equipo actualizado correctamente.',
            data: nuevoIngreso
        });

    } catch(error:any){
        console.error('❌ Error en confirmarIngresos:',error);
        return res.status(500).json({
            exito:false,
            error:error.message || 'Error al registrar la confirmacion en la base de datos.'
        });
    }
}