import { Router } from "express";
import { login, aceptarTerminos } from "../controllers/auth.controller";
import { limitadorLogin } from "../middlewares/rate-limit.middleware";
import { verificarAutenticacion } from "../middlewares/auth.middleware";

const router = Router();

router.post('/login', limitadorLogin, login);
router.post('/aceptar-terminos', verificarAutenticacion, aceptarTerminos);

export default router;