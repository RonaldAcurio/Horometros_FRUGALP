import { Router } from 'express';
import {
    crearRegistroActividad,
    finalizarRegistroActividad,
    editarRegistroActividad,
    eliminarRegistroActividad,
    obtenerRegistrosPorAsistencia,
    obtenerRegistrosPorOperador,
} from '../controllers/registro_actividad.controller';
import { verificarAutenticacion } from '../middlewares/auth.middleware';

const router = Router();

router.use(verificarAutenticacion);

router.post('/',crearRegistroActividad);
router.put('/:id/finalizar', finalizarRegistroActividad);
// Editar: solo equipo/actividad/OT/horometros/observaciones - nunca hora_inicio/hora_fin (ver el controller).
router.put('/:id', editarRegistroActividad);
// Eliminar: solo la ultima labor de la jornada (el controller lo re-verifica, nunca confia en el frontend).
router.delete('/:id', eliminarRegistroActividad);
router.get('/',obtenerRegistrosPorAsistencia);
// Historial de un operador a traves de varias jornadas - lo usa el reporte imprimible del Panel de Asistente.
router.get('/por-operador', obtenerRegistrosPorOperador);

export default router;