import { Equipo, Operador, Actividad, Ingresos_Semanales } from '../models/index';
import { Request, Response } from 'express';
import { analizarfotoHorometro } from '../services/gemini.service';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';

// Helper para pausar la ejecución unos milisegundos
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function procesarReporteHorometro(req: Request, res: Response) {
    try {

        if (!req.file) {
            return res.status(400).json({ exito: false, error: 'No se subio ninguna imagen' });
        }

        // 1. Extraer datos del reporte con Gemini
        const datosIA = await analizarfotoHorometro(req.file.buffer, req.file.mimetype);

        if (!datosIA.numero_tractor) {
            return res.status(400).json({ exito: false, error: 'No se pudo identificar el codigo del equipo en la hoja' });
        };

        // 2. Buscar Equipo en BD
        const alertas: string[] = [];
        let requireConfirmation = false;
        let equipoBD: any = null;

        //A. Intentando coincidencias combinando Nombre Maquinaria + Numero de Maquinaria
        if (datosIA.nombre_maquinaria && datosIA.numero_tractor) {
            equipoBD = await Equipo.findOne({
                where: {
                    numero_hoja: datosIA.numero_tractor,
                    nombre_maquinaria: { [Op.iLike]: `%${datosIA.nombre_maquinaria}%` }
                }
            });
        }

        // B. Si no lo encuentra por su nombre (o la hoja venia sin nombre escrito), buscar solo por numero de hoja o codigo megued
        if (!equipoBD) {
            const coincidencias = await Equipo.findAll({
                where: {
                    [Op.or]: [
                        { numero_hoja: datosIA.numero_tractor },
                        { codigo_megued: datosIA.numero_tractor }
                    ]
                }
            });
            if (coincidencias.length === 1) {
                equipoBD = coincidencias[0];
            } else if (coincidencias.length > 1) {
                //Hay mas de un equipo con ese mismo numero
                requireConfirmation = true;
                alertas.push(`Ambiguedad de Equipo: El numero '${datosIA.numero_tractor}' coincide con varios equipos (${coincidencias.map(e => e.nombre_equipo).join('|')}). Seleccione el correcto.`);
                //Tomamos el primero por defecto para pre-visualizar
                equipoBD = coincidencias[0];
            }
        }

        //VALIDACION ANTI-NULL: Evita que el codigo colapse mas abajo si no encuentra el equipo
        if (!equipoBD) {
            return res.status(404).json({
                exito: false,
                error: `El equipo '${datosIA.nombre_maquinaria || ''} ${datosIA.numero_tractor}' no existe en la base de datos.`
            });
        }

        // 3. Coincidencias flexibles de Operador y Actividad
        let operadorBD: any = null;
        if (datosIA.nombre_operador) {
            //limpiamos espacios extras
            const nombreLimpio = datosIA.nombre_operador.trim();
            const palabras = nombreLimpio.split(' ').filter((p: string) => p.length > 2);
            operadorBD = await Operador.findOne({
                where: {
                    [Op.or]: [
                        { nombre_completo: { [Op.iLike]: `%${nombreLimpio}%` } },
                        { nombre_hoja: { [Op.iLike]: `%${nombreLimpio}%` } },
                    ]
                }
            });

            //si no la encuentra (por variaciones) busca por apellido, palabras claves
            if (!operadorBD && palabras.length > 0) {
                operadorBD = await Operador.findOne({
                    where: {
                        [Op.or]: palabras.map((palabras: string) => ({
                            [Op.or]: [
                                { nombre_completo: { [Op.iLike]: `%${palabras}%` } },
                                { nombre_hoja: { [Op.iLike]: `%${palabras}%` } }
                            ]
                        }))
                    }
                });
            }
        }

        let actividadBD: any = null;
        if (datosIA.codigo_labor) {
            const LaborLimpia = datosIA.codigo_labor.trim();
            actividadBD = await Actividad.findOne({
                where: {
                    [Op.or]: [
                        { codigo_megued: LaborLimpia },
                        { description: { [Op.iLike]: `%${LaborLimpia}%` } }
                    ]
                }
            });
        }

        // 4. Buscar el ultimo ingreso registrado para este equipo
        const ultimoIngreso = await Ingresos_Semanales.findOne({
            where: { equipo_id: equipoBD.id },
            order: [['FECHA_INGRESO', 'DESC'], ['id', 'DESC']]
        });

        // 5. Calculos y validaciones de negocio
        const kmInicialHoja = Number(datosIA.km_inicial) || 0;
        const kmFinalHoja = Number(datosIA.km_final) || 0;
        const totalHorasHoja = Number((kmFinalHoja - kmInicialHoja).toFixed(2));

        if (ultimoIngreso) {
            // A. Validar discontinuidad de Horometros
            const ultimoKmFinalBD = Number(ultimoIngreso.km_inicial) + Number(ultimoIngreso.total_horas);
            if (kmInicialHoja !== ultimoKmFinalBD) {
                alertas.push(`Inconsistencia en Horometros: El ultimo registro en BD fue ${ultimoKmFinalBD}, pero la hoja inicia en ${kmInicialHoja}.`);
                requireConfirmation = true;
            }

            // B. Validar brecha temporal (Salto de dias)
            const fechaUltima = new Date(ultimoIngreso.FECHA_INGRESO);
            const fechaNueva = new Date(datosIA.fecha || Date.now());
            const diferenciaDias = Math.floor((fechaNueva.getTime() - fechaUltima.getTime()) / (1000 * 3600 * 24));

            if (diferenciaDias > 7) {
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
            mapeosBD: {
                equipo: { id: equipoBD.id, nombre: equipoBD.nombre_equipo, codigo: equipoBD.codigo_megued },
                operador: operadorBD ? { id: operadorBD.id, nombre: operadorBD.nombre_completo, codigo: operadorBD.codigo_megued } : null,
                actividad: actividadBD ? { id: actividadBD.id, descripcion: actividadBD.description, codigo: actividadBD.codigo_megued } : null,
            },
            calculos: {
                km_inicial: kmInicialHoja,
                km_Final: kmFinalHoja,
                total_horas: totalHorasHoja
            }
        });

    } catch (error: any) {
        console.error('❌ Error en procesosReporteHorometro:', error);
        return res.status(500).json({ exito: false, error: error.message || 'Error procesando el reporte' });
    }
}

export async function confirmarIngreso(req: Request, res: Response) {

    const t = await sequelize.transaction();

    try {
        const {
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
        if (!equipo_id || !operador_id || !actividad_id) {
            await t.rollback();
            return res.status(400).json({
                exito: false,
                error: 'Faltan campos obligatorios (codigo operador, codigo maquinaria y codigo actividad)'
            });
        }

        const equipoBD = await Equipo.findByPk(equipo_id, { transaction: t });
        if (!equipoBD) {
            await t.rollback();
            return res.status(404).json({
                exito: false,
                error: 'El equipo no existe.'
            });
        }

        // Calcular total_horas si no viene en el body
        const horasCalculadas = total_horas !== undefined
            ? Number(total_horas)
            : Number((Number(km_final) - Number(km_inicial)).toFixed(2));

        const kmInicialNum = Number(km_inicial) || 0;
        const kmFinalNum = km_final !== undefined ? Number(km_final) : (kmInicialNum + horasCalculadas);

        //horometro de megued
        const horometroInicioMEGUED = Number(equipoBD.ultimo_km_inicial) || 0;
        const nuecoAcumuladoReal = Number((horometroInicioMEGUED + horasCalculadas).toFixed(2));

        //formato fecha local
        const fechaIngresada = fecha || new Date().toLocaleDateString('sv-SE');

        // 1. Insercion en la tabla 'ingresos_semanales'
        const nuevoIngreso = await Ingresos_Semanales.create({
            equipo_id,
            operador_id,
            actividad_id,
            seccion: seccion || 'GENERAL',
            FECHA_INGRESO: fechaIngresada,
            km_inicial: horometroInicioMEGUED,
            total_horas: horasCalculadas,
        }, { transaction: t });

        // 2. Actualizar el horometro actual del equipo
        await Equipo.update({
            ultimo_km_inicial: nuecoAcumuladoReal,
            ultimo_real: kmFinalNum,
        }, {
            where: { id: equipo_id },
            transaction: t,
        });

        // 3. Mantener solo los 10 ultimos registros por equipos
        const registrosEquipo = await Ingresos_Semanales.findAll({
            where: { equipo_id },
            order: [['FECHA_INGRESO', 'DESC'], ['id', 'DESC']],
            transaction: t,
        });

        if (registrosEquipo.length > 10) {
            //extraer los id excaedentes del indice 10 en adelante
            const idsEliminar = registrosEquipo.slice(10).map(r => r.id);
            await Ingresos_Semanales.destroy({
                where: { id: idsEliminar },
                transaction: t,
            });
        }

        // 4. Si todo salio bien, confirmamos los cambios en la BD
        await t.commit();

        return res.status(200).json({
            exito: true,
            mensaje: 'Ingreso semanal registrado y estado del equipo actualizado correctamente.',
            data: nuevoIngreso,
            resumenMEGUED: {
                ultimo_km_Inicial: horometroInicioMEGUED,
                horas_sumadas: horasCalculadas,
                nuevo_km_final: nuecoAcumuladoReal,
                lectura_fisica_tablero: kmFinalNum
            }
        });

    } catch (error: any) {
        // En caso de cualquier error revierten todos los cambios a realizar
        await t.rollback();

        console.error('❌ Error en confirmarIngresos:', error);
        return res.status(500).json({
            exito: false,
            error: error.message || 'Error al registrar la confirmacion en la base de datos.'
        });
    }
}

export async function procesarLoteHorometros(req: Request, res: Response) {
    try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            return res.status(400).json({
                exito: false,
                error: 'No se subió ninguna imagen para el lote.'
            });
        }

        if (files.length > 6) {
            return res.status(400).json({
                exito: false,
                error: 'El límite máximo es de 6 imágenes por lote.'
            });
        }

        const resultados: any[] = [];
        let index = 0;

        // 1. Procesar imágenes de forma secuencial con pausa para no colapsar la cuota
        for (const file of files) {
            try {
                // Pausa de 3 segundos a partir de la segunda imagen para evitar el Rate Limit (429)
                if (index > 0) {
                    await delay(3000);
                }
                index++;

                const datosIA = await analizarfotoHorometro(file.buffer, file.mimetype);

                let equipoBD: any = null;

                if (datosIA.nombre_maquinaria && datosIA.numero_tractor) {
                    equipoBD = await Equipo.findOne({
                        where: {
                            numero_hoja: datosIA.numero_tractor,
                            nombre_maquinaria: { [Op.iLike]: `%${datosIA.nombre_maquinaria}%` }
                        }
                    });
                }

                if (!equipoBD && datosIA.numero_tractor) {
                    const coincidencia = await Equipo.findAll({
                        where: {
                            [Op.or]: [
                                { numero_hoja: datosIA.numero_tractor },
                                { codigo_megued: datosIA.numero_tractor }
                            ]
                        }
                    });
                    if (coincidencia.length >= 1) equipoBD = coincidencia[0];
                }

                let operadorBD: any = null;
                if (datosIA.nombre_operador) {
                    const nombreLimpio = datosIA.nombre_operador.trim();
                    operadorBD = await Operador.findOne({
                        where: {
                            [Op.or]: [
                                { nombre_completo: { [Op.iLike]: `%${nombreLimpio}%` } },
                                { nombre_hoja: { [Op.iLike]: `%${nombreLimpio}%` } }
                            ]
                        }
                    });
                }

                let actividadBD: any = null;
                if (datosIA.codigo_labor) {
                    const laborLimpia = datosIA.codigo_labor.trim();
                    actividadBD = await Actividad.findOne({
                        where: {
                            [Op.or]: [
                                { codigo_megued: laborLimpia },
                                { description: { [Op.iLike]: `%${laborLimpia}%` } }
                            ]
                        }
                    });
                }

                const kmInicialHoja = Number(datosIA.km_inicial) || 0;
                const kmFinalHoja = Number(datosIA.km_final) || 0;
                const totalHorasHoja = Number((kmFinalHoja - kmInicialHoja).toFixed(2));

                resultados.push({
                    datosExtraidos: datosIA,
                    mapeosBD: {
                        equipo: equipoBD ? { id: equipoBD.id, nombre: equipoBD.nombre_equipo, codigo: equipoBD.codigo_megued } : null,
                        operador: operadorBD ? { id: operadorBD.id, nombre: operadorBD.nombre_completo, codigo: operadorBD.codigo_megued } : null,
                        actividad: actividadBD ? { id: actividadBD.id, descripcion: actividadBD.description, codigo: actividadBD.codigo_megued } : null,
                    },
                    calculos: {
                        km_inicial: kmInicialHoja,
                        km_Final: kmFinalHoja,
                        total_Horas: totalHorasHoja
                    }
                });

            } catch (errorItem: any) {
                console.error(`⚠️ Error analizando la imagen ${file.originalname}:`, errorItem.message);
            }
        }

        // ⚠️ CLAVE: Si ninguna imagen pudo procesarse por error de la API/Cuota, responder con error 429
        if (resultados.length === 0) {
            return res.status(429).json({
                exito: false,
                error: 'Se superó la cuota de peticiones de la API de IA. Por favor, espera entre 30 segundos y 1 minuto antes de reintentar.'
            });
        }

        // Ordenamiento por fecha
        resultados.sort((a, b) => {
            const fechaA = new Date(a.datosExtraidos.fecha || Date.now()).getTime();
            const fechaB = new Date(b.datosExtraidos.fecha || Date.now()).getTime();
            return fechaA - fechaB;
        });

        return res.status(200).json({
            exito: true,
            mensaje: 'Lote procesado correctamente.',
            reportesOrdenados: resultados
        });

    } catch (error: any) {
        console.error('❌ Error en procesarLoteHorometros:', error);
        return res.status(500).json({
            exito: false,
            error: error.message || 'Error al procesar el lote de reportes.'
        });
    }
}