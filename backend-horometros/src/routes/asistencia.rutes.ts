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
    marcarConCodigo,
    generarMiQr,
    marcarConQrSesion,
    confirmarAsistencia,
} from "../controllers/asistencia.controller";
import { verificarAutenticacion, requireRol, verificarJornadaOperadorActiva } from "../middlewares/auth.middleware";

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
router.put('/operadores/:id/clave',verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), resetearClaveOperador);

// Camino A: hacienda sin camara, marca con usuario+clave+Token de Hacienda. No requiere JWT (la credencial ES el operador).
router.post('/marcar-codigo', marcarConCodigo);

// Camino B: el propio Operador/Mecanico (ya logueado) pide su QR de jornada, que se renueva cada 90s.
router.get('/mi-qr', verificarAutenticacion, verificarJornadaOperadorActiva, generarMiQr);
// Camino B: Supervisor o Escaner (punto de control) escanean ese QR para marcar entrada/salida.
router.post('/marcar-qr-sesion', verificarAutenticacion, requireRol('SUPERVISOR','ESCANER'), marcarConQrSesion);

// O/X: el Supervisor confirma si el trabajador que aparece logueado hoy realmente esta presente.
router.put('/:id/confirmar', verificarAutenticacion, requireRol('SUPERVISOR','ADMIN'), confirmarAsistencia);

export default router;