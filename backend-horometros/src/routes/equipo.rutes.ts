import { Router } from 'express';
import { obtenerEquipos, crearEquipo, actualizarEquipo, eliminarEquipo } from '../controllers/equipo.controller';
import { verificarAutenticacion, requireRol } from '../middlewares/auth.middleware';

const router = Router();

// Cualquier cuenta logueada puede listar equipos (lo necesita el Panel de Actividades de MECANICO/OPERADOR).
router.get('/', verificarAutenticacion, obtenerEquipos);

// Mutaciones del catálogo (pestaña "Equipo" del Panel de Asistente): mismos roles que gestionan Operador/Actividad.
router.post('/', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), crearEquipo);
router.put('/:id', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), actualizarEquipo);
router.delete('/:id', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), eliminarEquipo);

export default router;
