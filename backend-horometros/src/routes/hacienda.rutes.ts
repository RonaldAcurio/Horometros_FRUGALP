import { Router } from 'express';
import { generarTokenHacienda, invalidarToken, obtenerHaciendas } from '../controllers/hacienda.controller';
import { verificarAutenticacion, requireRol } from '../middlewares/auth.middleware';

const router = Router();

router.use(verificarAutenticacion, requireRol('ADMIN','SUPERVISOR'));

router.get('/', obtenerHaciendas);
router.post('/:id/token',generarTokenHacienda);
router.delete('/:id/token', invalidarToken);

export default router;