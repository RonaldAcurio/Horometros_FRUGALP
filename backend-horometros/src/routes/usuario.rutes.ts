import { Router } from "express";
import { crearUsuario, obtenerUsuarios, resetearClaveUsuario, eliminarUsuario } from "../controllers/usuario.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

/*
Menu Admin: crear/listar cuentas de oficina, resetear sus claves y eliminarlas (soft-delete). Tambien lo puede
hacer ASISTENTE (decision de negocio: lo va a manejar la Asistente de gerencia) - pero solo esto, el resto del
Menu Admin (Haciendas/Token, ver hacienda.rutes.ts) sigue exclusivo de ADMIN.
*/
router.use(verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'));

router.post('/', crearUsuario);
router.get('/', obtenerUsuarios);
router.put('/:id/clave', resetearClaveUsuario);
router.delete('/:id', eliminarUsuario);

export default router;
