import { Router } from "express";
import { 
    ObtenerActividades, 
    obtenerActividadPorId, 
    crearActividad, 
    actualizarActividad, 
    eliminarActividad,
} from "../controllers/actividades.controller";

const router = Router();

router.get('/',ObtenerActividades);
router.get('/:id',obtenerActividadPorId);
router.post('/nueva',crearActividad);
router.put('/:id',actualizarActividad);
router.delete('/:id',eliminarActividad);

export default router;