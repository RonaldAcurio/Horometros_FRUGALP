import { Router } from 'express';
import { crearRegistroActividad, finalizarRegistroActividad, obtenerRegistrosPorAsistencia } from '../controllers/registro_actividad.controller';
import { verificarAutenticacion } from '../middlewares/auth.middleware';

const router = Router();

router.use(verificarAutenticacion);

router.post('/',crearRegistroActividad);
router.put('/:id/finalizar', finalizarRegistroActividad);
router.get('/',obtenerRegistrosPorAsistencia);

export default router;