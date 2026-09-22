import { Router } from "express";
import { crearUsuario, obtenerUsuarios, resetearClaveUsuario } from "../controllers/usuario.controller";
import { verificarAutenticacion, requireRol } from "../middlewares/auth.middleware";

const router = Router();

/*
Menu Admin: crear/listar cuentas de oficina y resetear sus claves. Tambien lo puede hacer ASISTENTE (decision
de negocio: lo va a manejar la Asistente de gerencia) - pero solo esto, el resto del Menu Admin (Haciendas/Token,
ver hacienda.rutes.ts) sigue exclusivo de ADMIN.
*/
router.use(verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE'));

router.post('/', crearUsuario);
router.get('/', obtenerUsuarios);
router.put('/:id/clave', resetearClaveUsuario);

export default router;
