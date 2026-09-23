import { Router } from 'express';
import { crearRegistroActividad, finalizarRegistroActividad, obtenerRegistrosPorAsistencia, obtenerRegistrosPorOperador } from '../controllers/registro_actividad.controller';
import { verificarAutenticacion } from '../middlewares/auth.middleware';

const router = Router();

router.use(verificarAutenticacion);

router.post('/',crearRegistroActividad);
router.put('/:id/finalizar', finalizarRegistroActividad);
router.get('/',obtenerRegistrosPorAsistencia);
// Historial de un operador a traves de varias jornadas - lo usa el reporte imprimible del Panel de Asistente.
router.get('/por-operador', obtenerRegistrosPorOperador);

export default router;