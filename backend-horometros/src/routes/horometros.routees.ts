import { Router } from "express";
import { upload } from "../middlewares/upload.middleware";
import { analizarfotoHorometro } from "../services/gemini.service";
import { procesarReporteHorometro, confirmarIngreso, procesarLoteHorometros } from "../controllers/horometros.controller";

const router = Router();

/*
// Ruta para subir un archivo
router.post('/procesar-foto', upload.single('imagen'), async (req,res): Promise<void> =>{

    try{
        if(!req.file){
            res.status(400).json({error:'No se encontro ninguna imagen. 🚫'});
            return;
        }

        console.log('📸 Procesando foto en Gemini:', req.file.originalname);

        //Enviamos la foto desde la memoria  RAM(buffer) hacia Gemini
        const resultadoIA = await analizarfotoHorometro(
            req.file.buffer,
            req.file.mimetype
        );

        console.log('🤖 Resultado de Gemini:', resultadoIA);

        res.json({
            exito: true,
            mensaje: 'Foto procesada correctamente con IA',
            archivo: {
                nombre: req.file.originalname,
                peso_bytes: req.file.size,
            },
            resultado: resultadoIA,
        });

    } catch(error:any){
        console.error('❌ Error procesando foto:', error);
        res.status(500).json({
            exito: false,
            error: error.message || 'Error interno al procesar la imagen.',
        });
    }
});
*/

router.post('/procesar-foto',upload.single('imagen'), procesarReporteHorometro);
router.post('/confirmar-ingreso',confirmarIngreso);
router.post('/procesar-lote',upload.array('imagenes',6), procesarLoteHorometros);

export default router;