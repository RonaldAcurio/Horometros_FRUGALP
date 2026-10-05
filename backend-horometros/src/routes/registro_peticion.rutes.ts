import { Router } from "express";
import { obtenerRegistrosPeticion } from "../controllers/registro_peticion.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

router.get('/', verificarAutenticacion, requireRol('ADMIN'), obtenerRegistrosPeticion);

export default router;
