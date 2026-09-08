import { Request, Response } from 'express'
import { Actividad } from '../models'

// Consultar todas las ACtividades utilizadno nuestro ORM
export const ObtenerActividades = async( req:Request, res:Response ) => {
    try{

        const { categoria } = req.query;
        
        const wherecategoria = categoria ? { categoria: String(categoria).toUpperCase() } : {};

        const actividades = await Actividad.findAll({
            where : wherecategoria,
            order : [['id','ASC']]
        });

        return res.status(200).json(actividades);

    } catch(err){
        return res.status(500).json({ message:'No se pudo procesar su solicitud', err });
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
        return res.status(500).json({ message: 'No se puede procesar solicitud de esta categoria', err});
    }
}

// Crear una nueva Actividad
export const crearActividad = async(req:Request, res:Response ) => {
    try{
        const { codigo_megued, description, categoria} = req.body;
        if(!codigo_megued || !description){
            return res.status(400).json({ message:'El codigo Megued y la Descripcion son campos requeridos '});
        }
/*
        const existente = await Actividad.findOne({ where: { codigo_megued: codigo_megued }});
        if(existente){
            return res.status(400).json({ message: 'Este codigo ya existe'});
        }
*/
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
        return res.status(500).json({ message: 'Error al crear una Nueva Actividad', err});
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

        return res.status(500).json({ message:'Error al actualziar la tabla',err });
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