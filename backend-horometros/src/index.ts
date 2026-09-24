import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { conectarBD } from './config/database';

const PORT = process.env.PORT || 3000;

const startServer = async() => {
    await conectarBD();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
};

startServer();