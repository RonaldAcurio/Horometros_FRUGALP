import { Router } from "express";
import { obtenerAuditoria } from "../controllers/auditoria.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

router.get('/', verificarAutenticacion, requireRol('ADMIN'), obtenerAuditoria);

export default router;
