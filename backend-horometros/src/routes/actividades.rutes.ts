import { Router } from "express";
import {
    ObtenerActividades,
    obtenerActividadPorId,
    crearActividad,
    actualizarActividad,
    eliminarActividad,
} from "../controllers/actividades.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

// Catalogo de Actividades: lectura publica a proposito - el kiosco de marcacion (sin login) lo necesita
// para que el trabajador elija su actividad al marcar salida (ver modal-actividad + marcacion-kiosco.ts).
router.get('/',ObtenerActividades);
router.get('/:id',obtenerActividadPorId);

// Mutaciones del catalogo: pestaña "Actividad" del Panel de Asistente (ADMIN/ASISTENTE, mismos roles que
// gestionan Operador/Equipo).
router.post('/nueva', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), crearActividad);
router.put('/:id', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), actualizarActividad);
router.delete('/:id', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), eliminarActividad);

export default router;