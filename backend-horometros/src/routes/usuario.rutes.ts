import { Router } from "express";
import { crearUsuario, obtenerUsuarios, resetearClaveUsuario } from "../controllers/usuario.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

// Todo este modulo es exclusivo del Menu Admin: crear/listar cuentas de oficina y resetear sus claves.
router.use(verificarAutenticacion, requireRol('ADMIN'));

router.post('/', crearUsuario);
router.get('/', obtenerUsuarios);
router.put('/:id/clave', resetearClaveUsuario);

export default router;
