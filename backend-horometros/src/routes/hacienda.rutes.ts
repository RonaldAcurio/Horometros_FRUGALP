import { Router } from 'express';
import { generarTokenHacienda, invalidarToken } from '../controllers/hacienda.controller';
import { verificarAutenticacion, requireRol } from '../middlewares/auth.middleware';

const router = Router();

router.use(verificarAutenticacion, requireRol('ADMIN','SUPERVISOR'));

router.post('/:id/token',generarTokenHacienda);
router.delete('/:id/token', invalidarToken);

export default router;