import { Router } from 'express';
import { obtenerEquipos } from '../controllers/equipo.controller';
import { verificarAutenticacion } from '../middlewares/auth.middleware';

const router = Router();

// Cualquier cuenta logueada puede listar equipos (lo necesita el Panel de Actividades de MECANICO/OPERADOR).
router.get('/', verificarAutenticacion, obtenerEquipos);

export default router;
