import { Router } from 'express';
import { obtenerSecciones, crearSeccion, actualizarSeccion, eliminarSeccion } from '../controllers/seccion.controller';
import { verificarAutenticacion, requireRol } from '../middlewares/auth.middleware';

const router = Router();

/*
Lectura: ADMIN/ASISTENTE la necesitan para el selector "Área" al crear/editar un Operador (ver asistencia.rutes.ts,
crearOperador/actualizarOperador admite ambos roles); SUPERVISOR se agrega por el mismo criterio ya usado en
hacienda.rutes.ts (ve el listado, no administra). Mutaciones (crear/editar/eliminar) exclusivas de ADMIN: la
gestión de Secciones vive dentro de la pestaña "Haciendas" del Panel Admin, no en el Panel de Asistente.
*/
router.get('/', verificarAutenticacion, requireRol('ADMIN', 'ASISTENTE', 'SUPERVISOR'), obtenerSecciones);
router.post('/', verificarAutenticacion, requireRol('ADMIN'), crearSeccion);
router.put('/:id', verificarAutenticacion, requireRol('ADMIN'), actualizarSeccion);
router.delete('/:id', verificarAutenticacion, requireRol('ADMIN'), eliminarSeccion);

export default router;
