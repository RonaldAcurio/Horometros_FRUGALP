import { Router } from 'express';
import { generarTokenHacienda, invalidarToken, obtenerHaciendas, crearHacienda } from '../controllers/hacienda.controller';
import { verificarAutenticacion, requireRol } from '../middlewares/auth.middleware';

const router = Router();

router.use(verificarAutenticacion, requireRol('ADMIN','SUPERVISOR','ASISTENTE'));

/*
Listar haciendas es lectura sola (nombre + estado del token) - se amplia a ASISTENTE porque ahora tambien crea
Usuarios (incluye SUPERVISOR/ESCANER) y necesita el mismo selector de hacienda que ve el Admin. Crear/generar/
invalidar siguen mas restringidos (ver abajo): eso si es una accion, no una simple lectura.
*/
router.get('/', obtenerHaciendas);
// Crear haciendas es exclusivo de ADMIN (un Supervisor administra la suya, no crea otras; Asistente tampoco).
router.post('/', requireRol('ADMIN'), crearHacienda);
// Generar/invalidar el Token es una accion sobre el punto de control fisico - se queda en ADMIN/SUPERVISOR,
// Asistente no entra aca aunque el router de arriba ya la deje pasar por verificarAutenticacion.
router.post('/:id/token', requireRol('ADMIN','SUPERVISOR'), generarTokenHacienda);
router.delete('/:id/token', requireRol('ADMIN','SUPERVISOR'), invalidarToken);

export default router;