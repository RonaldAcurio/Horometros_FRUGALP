import { Router } from "express";
import { 
    crearOperador,
    actualizarOperador, 
    obtenerOperadores, 
    registrarMacarcoQR, 
    obtenerAsistenciaHoy 
} from "../controllers/asistencia.controller";

const router = Router();

router.post('/operadores',crearOperador);
router.get('/operadores', obtenerOperadores);
router.put('/operadores/:id', actualizarOperador);
router.post('/marcar-qr', registrarMacarcoQR);
router.get('/hoy', obtenerAsistenciaHoy);

export default router;