import { Router } from 'express';
import { obtenerEquipos, crearEquipo, importarEquipos, actualizarEquipo, eliminarEquipo, diagnosticoDuplicadosEquipos } from '../controllers/equipo.controller';
import { verificarAutenticacion, requireRol } from '../middlewares/auth.middleware';

const router = Router();

// Cualquier cuenta logueada puede listar equipos (lo necesita el Panel de Actividades de MECANICO/OPERADOR).
router.get('/', verificarAutenticacion, obtenerEquipos);
// Temporal (ver diagnosticoDuplicadosEquipos en equipo.controller.ts) - solo lectura, solo ADMIN.
router.get('/diagnostico-duplicados', verificarAutenticacion, requireRol('ADMIN'), diagnosticoDuplicadosEquipos);

// Mutaciones del catálogo (pestaña "Equipo" del Panel de Asistente): mismos roles que gestionan Operador/Actividad.
router.post('/', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), crearEquipo);
// Importación masiva desde Excel (botón "Importar") - misma pestaña, mismos roles.
router.post('/importar', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), importarEquipos);
router.put('/:id', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), actualizarEquipo);
router.delete('/:id', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'), eliminarEquipo);

export default router;
