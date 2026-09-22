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
    marcarConMiCodigo,
    generarMiQr,
    obtenerMiEstado,
    marcarConQrSesion,
    confirmarAsistencia,
} from "../controllers/asistencia.controller";
import { verificarAutenticacion, requireRol, verificarJornadaOperadorActiva } from "../middlewares/auth.middleware";

const router = Router();

// Gestion de Personal (Directorio de Operadores, Historial): mismos roles que ya protegen /asistencia/asistente
// en el frontend (ver roleGuard en app.routes.ts) - crear/editar Operador, listarlos y ver el Historial de auditoria.
router.post('/operadores', verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), crearOperador);
router.get('/operadores', verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), obtenerOperadores);
router.put('/operadores/:id', verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), actualizarOperador);
router.get('/historial', verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), obtenerHistorial);
router.put('/operadores/:id/clave',verificarAutenticacion, requireRol('ADMIN','ASISTENTE'), resetearClaveOperador);

// Carnet fisico del kiosco: sin JWT a proposito, el trabajador lo usa SIN loguearse (ver marcacion-kiosco.ts).
router.post('/marcar-qr', registrarMacarcoQR);

// Panel de Supervisor: reporte del dia, cierre de jornada y ajustes de un registro - mismos roles que
// /asistencia/supervisor en el frontend.
router.get('/hoy', verificarAutenticacion, requireRol('ADMIN','SUPERVISOR'), obtenerAsistenciaHoy);
router.post('/finalizar-dia', verificarAutenticacion, requireRol('ADMIN','SUPERVISOR'), finalizarDia);
router.put('/revisar/:id', verificarAutenticacion, requireRol('ADMIN','SUPERVISOR'), revisarAsistencia);

// "Ver Evidencia" (VisorFoto): componente compartido por Panel de Asistente y Panel de Supervisor, asi que
// acepta los 3 roles de oficina que pueden llegar a ver un registro de asistencia.
router.get('/:id/foto', verificarAutenticacion, requireRol('ADMIN','ASISTENTE','SUPERVISOR'), obtenerFotoAsistencia);

router.post('/admitir-externo',verificarAutenticacion, requireRol('SUPERVISOR','ADMIN'),admitirTrabajadorExterno);

// Camino A: hacienda sin camara, marca con usuario+clave+Token de Hacienda. No requiere JWT (la credencial ES el operador).
router.post('/marcar-codigo', marcarConCodigo);
// Camino A para un trabajador YA logueado (pantalla "mi jornada"): solo confirma el codigo, sin re-escribir su clave.
router.post('/marcar-mi-codigo', verificarAutenticacion, verificarJornadaOperadorActiva, marcarConMiCodigo);

// Camino B: el propio Operador/Mecanico (ya logueado) pide su QR de jornada, que se renueva cada 90s.
router.get('/mi-qr', verificarAutenticacion, verificarJornadaOperadorActiva, generarMiQr);
// El propio Operador consulta si ya tiene jornada abierta hoy (lo usa la pantalla del QR flotante para saber
// cuando lo escanearon y pasar al Panel de Actividades). Sin verificarJornadaOperadorActiva a proposito: este
// endpoint reporta el estado tal cual esta, incluido "ya se cerro" - no tiene sentido que se corte a si mismo.
router.get('/mi-estado', verificarAutenticacion, obtenerMiEstado);
// Camino B: Supervisor o Escaner (punto de control) escanean ese QR para marcar entrada/salida.
router.post('/marcar-qr-sesion', verificarAutenticacion, requireRol('ADMIN','SUPERVISOR','ESCANER'), marcarConQrSesion);

// O/X: el Supervisor confirma si el trabajador que aparece logueado hoy realmente esta presente.
router.put('/:id/confirmar', verificarAutenticacion, requireRol('SUPERVISOR','ADMIN'), confirmarAsistencia);

export default router;