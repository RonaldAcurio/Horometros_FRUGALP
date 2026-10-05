import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { conectarBD } from './config/database';
import { limpiarRegistrosPeticionAntiguos } from './utils/limpiar-registros-peticion';

const PORT = process.env.PORT || 3000;
const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

const startServer = async() => {
    await conectarBD();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
    // Limpieza del historial de peticiones (ver limpiar-registros-peticion.ts): una vez al arrancar y despues
    // cada 24h, mientras este mismo proceso siga vivo.
    limpiarRegistrosPeticionAntiguos();
    setInterval(limpiarRegistrosPeticionAntiguos, VEINTICUATRO_HORAS_MS);
};

startServer();