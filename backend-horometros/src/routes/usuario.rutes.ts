import { Router } from "express";
import { resetearClaveUsuario } from "../controllers/usuario.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

router.put('/:id/clave',verificarAutenticacion, requireRol('ADMIN'), resetearClaveUsuario);

export default router;