import { Router } from "express";
import { upload } from "../middlewares/upload.middleware";
import { procesarReporteHorometro, confirmarIngreso, procesarLoteHorometros } from "../controllers/horometros.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

// Modulo Horometros: ADMIN/ASISTENTE/SUPERVISOR (roles de oficina con Dashboard). ESCANER y MECANICO/OPERADOR
// tienen su propia pantalla dedicada y nunca llegan al Dashboard, asi que no necesitan este modulo.
router.post('/procesar-foto', verificarAutenticacion, requireRol('ADMIN','ASISTENTE','SUPERVISOR'), upload.single('imagen'), procesarReporteHorometro);
router.post('/confirmar-ingreso', verificarAutenticacion, requireRol('ADMIN','ASISTENTE','SUPERVISOR'), confirmarIngreso);
router.post('/procesar-lote', verificarAutenticacion, requireRol('ADMIN','ASISTENTE','SUPERVISOR'), upload.array('imagenes',6), procesarLoteHorometros);

export default router;