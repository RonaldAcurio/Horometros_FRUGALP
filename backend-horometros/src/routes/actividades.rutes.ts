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

// Mutaciones del catalogo (crear/editar/eliminar actividad): no hay UI todavia (ver CLAUDE.md, "Equipos/
// Actividades/Secciones management tab" en Pendiente), pero quedan protegidas ya mismo - solo ADMIN.
router.post('/nueva', verificarAutenticacion, requireRol('ADMIN'), crearActividad);
router.put('/:id', verificarAutenticacion, requireRol('ADMIN'), actualizarActividad);
router.delete('/:id', verificarAutenticacion, requireRol('ADMIN'), eliminarActividad);

export default router;