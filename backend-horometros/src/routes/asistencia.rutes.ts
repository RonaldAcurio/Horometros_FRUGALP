import { Router } from "express";
import { 
    crearOperador,
    actualizarOperador, 
    obtenerOperadores, 
    registrarMacarcoQR, 
    obtenerAsistenciaHoy,
    finalizarDia,
    obtenerHistorial,
    revisarAsistencia,
    obtenerFotoAsistencia,
    admitirTrabajadorExterno,
    resetearClaveOperador,
} from "../controllers/asistencia.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

router.post('/operadores',crearOperador);
router.get('/operadores', obtenerOperadores);
router.put('/operadores/:id', actualizarOperador);
router.post('/marcar-qr', registrarMacarcoQR);
router.get('/hoy', obtenerAsistenciaHoy);
router.post('/finalizar-dia',finalizarDia);
router.get('/historial',obtenerHistorial);
router.put('/revisar/:id',revisarAsistencia);
router.get('/:id/foto', obtenerFotoAsistencia);
router.post('/admitir-externo',verificarAutenticacion, requireRol('SUPERVISOR','ADMIN'),admitirTrabajadorExterno);
router.put('/operador/:id/clave',verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), resetearClaveOperador);

export default router;