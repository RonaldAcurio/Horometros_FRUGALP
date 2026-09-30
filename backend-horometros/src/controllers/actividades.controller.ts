import { Request, Response } from 'express'
import { Op } from 'sequelize'
import { Actividad } from '../models'

/*
Consultar todas las Actividades. Sin 'pagina'/'limite' en la query devuelve el arreglo completo (asi lo esperan
el kiosco y el selector de actividades del camino codigo, que muestran TODO el catalogo como checklist). Con
'pagina' o 'limite', responde paginado (mismo patron que 'obtenerAsistenciaHoy') - lo usa el selector del Panel
de Actividades, cuyo catalogo puede crecer. 'q' opcional (solo aplica en el modo paginado) filtra por
codigo_megued/description - lo usa el autocompletar (escribe y va apareciendo la actividad).
*/
export const ObtenerActividades = async( req:Request, res:Response ) => {
    try{

        const { categoria, pagina: paginaQuery, limite: limiteQuery, q: qQuery } = req.query;

        const wherecategoria = categoria ? { categoria: String(categoria).toUpperCase() } : {};

        if(paginaQuery === undefined && limiteQuery === undefined){
            const actividades = await Actividad.findAll({
                where : wherecategoria,
                order : [['id','ASC']]
            });
            return res.status(200).json(actividades);
        }

        const pagina = Math.max(1, Number(paginaQuery) || 1);
        const limite = Math.min(100, Math.max(1, Number(limiteQuery) || 20));
        const offset = (pagina - 1) * limite;
        const q = typeof qQuery === 'string' ? qQuery.trim() : '';

        const where = q ? {
            ...wherecategoria,
            [Op.or]: [
                { codigo_megued: { [Op.iLike]: `%${q}%` } },
                { description: { [Op.iLike]: `%${q}%` } },
            ],
        } : wherecategoria;

        const { rows: actividades, count: total } = await Actividad.findAndCountAll({
            where,
            order : [['id','ASC']],
            limit: limite,
            offset,
        });

        return res.status(200).json({ data: actividades, total, pagina, totalPaginas: Math.ceil(total / limite) || 1 });

    } catch(err){
        console.error('No se pudo procesar su solicitud', err);
        return res.status(500).json({ message: 'No se pudo procesar su solicitud' });
    }
}

// Buscar la Actividad por su clave Primaria
export const  obtenerActividadPorId = async(req: Request, res: Response) => {
    try{
        const {id} = req.params;
        const categoriaId = await Actividad.findByPk(Number(id));

        if(!categoriaId){
           return res.status(404).json({ message: 'Actividad no encontrada'});  
        }

        return res.status(200).json(categoriaId);

    } catch(err){
        console.error('No se puede procesar solicitud de esta categoria', err);
        return res.status(500).json({ message: 'No se puede procesar solicitud de esta categoria' });
    }
}

// Crear una nueva Actividad
export const crearActividad = async(req:Request, res:Response ) => {
    try{
        const { codigo_megued, description, categoria} = req.body;
        if(!codigo_megued || !description){
            return res.status(400).json({ message:'El codigo Megued y la Descripcion son campos requeridos '});
        }

        const nuevaActividad = await Actividad.create({
            codigo_megued,
            description,
            categoria: categoria || 'TALLER'
        });

        return res.status(201).json( nuevaActividad );

    } catch(err:any){
        console.error("ERROR REAL DE SEQUELIZE",err)
        if( err.name === 'SequelizeUniqueConstraintError'){
            return res.status(400).json({ message:'El codigo MEGUED ya esta existente'});
        }
        console.error('Error al crear una Nueva Actividad', err);
        return res.status(500).json({ message: 'Error al crear una Nueva Actividad' });
    }
}

/*
Importación masiva desde Excel (pestaña "Actividad" del Panel de Asistente, mismo pedido que Equipo -
2026-09-29). El parseo del .xlsx vive en el frontend (ver excel-importar.util.ts) - acá solo llega el JSON ya
mapeado ({codigo_megued, description, categoria?}[]). Reporta fila por fila qué se creó y qué se rechazó (y
por qué) en vez de fallar todo-o-nada, mismo criterio que importarEquipos (equipo.controller.ts).
*/
/*
Investiga, RECIEN cuando el INSERT de una fila ya chocó de verdad contra el UNIQUE de Postgres, si el código fue
de una actividad activa o de una soft-deleted - consulta directa a la BD en vez de comparar contra un mapa
pre-armado. Mismo motivo que describirColisionEquipo en equipo.controller.ts: un caso real (2026-09-30) demostró
que el chequeo previo (findAll(paranoid:false) + Map ANTES del insert) puede fallar a detectar un choque real.
*/
const describirColisionActividad = async (codigo: string): Promise<string> => {
    const existente = await Actividad.findOne({ where: { codigo_megued: codigo }, paranoid: false });
    if (!existente) {
        return `El código "${codigo}" ya está en uso.`;
    }
    return existente.deletedAt
        ? `El código "${codigo}" perteneció a una actividad eliminada antes - pide a un Admin que la recupere si hace falta.`
        : `Ya existe una actividad con el código "${codigo}".`;
};

export const importarActividades = async(req:Request, res:Response) => {
    try{
        const items = req.body.items;
        if(!Array.isArray(items) || items.length === 0){
            return res.status(400).json({ message: 'No se recibió ninguna actividad para importar.' });
        }
        if(items.length > 2000){
            return res.status(400).json({ message: 'Máximo 2000 filas por importación - divide el archivo en partes más pequeñas.' });
        }

        const rechazados: { fila: number; motivo: string }[] = [];
        const codigosEnArchivo = new Set<string>();
        let creados = 0;

        for (let index = 0; index < (items as unknown[]).length; index++) {
            const fila = index + 2;
            const datos = (items as unknown[])[index] as { codigo_megued?: unknown; description?: unknown; categoria?: unknown };
            const codigo = String(datos?.codigo_megued ?? '').trim();
            const description = String(datos?.description ?? '').trim();
            const categoriaTexto = String(datos?.categoria ?? '').trim().toUpperCase();
            const categoria: 'TALLER' | 'CAMPO' = categoriaTexto === 'CAMPO' ? 'CAMPO' : 'TALLER';

            if(!codigo || !description){
                rechazados.push({ fila, motivo: 'Falta el código o la descripción de la actividad.' });
                continue;
            }
            if(codigo.length > 20){
                rechazados.push({ fila, motivo: `El código "${codigo}" supera los 20 caracteres permitidos.` });
                continue;
            }
            if(description.length > 150){
                rechazados.push({ fila, motivo: 'La descripción supera los 150 caracteres permitidos.' });
                continue;
            }
            const codigoLower = codigo.toLowerCase();
            if(codigosEnArchivo.has(codigoLower)){
                rechazados.push({ fila, motivo: `El código "${codigo}" está repetido dentro del archivo.` });
                continue;
            }

            try {
                await Actividad.create({ codigo_megued: codigo, description, categoria });
                codigosEnArchivo.add(codigoLower);
                creados++;
            } catch (err: any) {
                if (err.name === 'SequelizeUniqueConstraintError') {
                    rechazados.push({ fila, motivo: await describirColisionActividad(codigo) });
                    continue;
                }
                throw err;
            }
        }

        return res.status(201).json({ creados, rechazados });
    } catch(err: any){
        console.error('Error al importar actividades.', err);
        return res.status(500).json({ message: 'Error al importar actividades.' });
    }
}

// Editar una Actividad
export const actualizarActividad = async(req: Request, res:Response) => {
    try{
        const { id } = req.params;
        const { codigo_megued, description, categoria} = req.body;

        const existente = await Actividad.findByPk(Number(id));
        if(!existente){
            return res.status(400).json({ message: 'Esta actividad no existe'});
        }

        await existente.update({
            codigo_megued: codigo_megued ?? existente.codigo_megued,
            description: description ?? existente.description,
            categoria: categoria ?? existente.categoria
        });

        return res.status(200).json({
            message: 'Actividad actualiza con exito',
            existente
        });

    } catch(err){

        console.error('Error al actualziar la tabla', err);
        return res.status(500).json({ message: 'Error al actualziar la tabla' });
    }
}

// Eliminar una Actividad
export const eliminarActividad = async(req:Request, res:Response ) => {
    try{

        const { id } = req.params;

        const actividad = await Actividad.findByPk(Number(id));
        if( !actividad ){
            return res.status(404).json({ message:'Esta actividad no se pudo encontrar'});
        }

        await actividad.destroy();
        return res.status(200).json({ message:'Actividad eliminada exitosamente'});

    } catch(err){

        return res.status(500).json({ message:'Error al intentar eliminar la actividad'});

    }
}