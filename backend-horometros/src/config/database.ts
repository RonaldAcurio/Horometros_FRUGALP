import { Sequelize } from "sequelize";
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(
    process.env.DB_NAME || 'horometros_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASWORD || '1234',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'postgres',
        port: Number(process.env.DB_PORT) || 5432,
        logging: false, //evita ensuciar la consola con logs de Sequelize
    }
);

export const conectarBD = async():Promise<void> => {
    try{
        await sequelize.authenticate();
        console.log('Conexión a la base de datos establecida correctamente.');
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        process.exit(1); // Salir del proceso con un código de error
    }
}