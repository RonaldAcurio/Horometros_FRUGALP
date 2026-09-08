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
} from "../controllers/asistencia.controller";

const router = Router();

router.post('/operadores',crearOperador);
router.get('/operadores', obtenerOperadores);
router.put('/operadores/:id', actualizarOperador);
router.post('/marcar-qr', registrarMacarcoQR);
router.get('/hoy', obtenerAsistenciaHoy);
router.post('/finalizar-dia',finalizarDia);
router.get('/historial',obtenerHistorial);
router.put('/revisar/:id',revisarAsistencia);

export default router;