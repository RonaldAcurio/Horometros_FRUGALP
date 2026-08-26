import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { conectarBD } from './config/database';
import { Equipo } from './models/equipo';


const PORT = process.env.PORT || 3000;

const startServer = async() => {

    //prueba rapido a la BD
    const prueba = await Equipo.findOne({where : {numero_hoja: '33'}});
    if(prueba){
        console.log(`🚜 Equipo Encontrado: ${prueba.nombre_equipo}, Codigo:${prueba.codigo_megued}`);
    } else {
        console.log(`⚠️ No se encontro el registro de la hoja 33 en la base de datos`);
    }


    await conectarBD();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
};

startServer();