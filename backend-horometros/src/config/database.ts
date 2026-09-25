import { Sequelize } from "sequelize";
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production' || process.env.DB_HOST?.includes('render.com') || process.env.DB_HOST?.startsWith('dpg-');

export const sequelize = new Sequelize(
    process.env.DB_NAME || 'horometros_db',
    process.env.DB_USER || 'postgre',
    process.env.DB_PASSWORD || process.env.DB_PASWORD || '1234',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'postgres',
        port: Number(process.env.DB_PORT) || 5432,
        logging: false,
        dialectOptions: isProduction ? {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        } : {},
        /*
        Sin esto, Sequelize usa su default (max:5) - suficiente para probar local, pero cada instancia del
        backend que corra en produccion abre su PROPIO pool: con 2 replicas seria 2x5=10 conexiones, con mas
        replicas escala sin control y puede chocar contra el limite de conexiones que permita el plan de
        Postgres. Se deja explicito y moderado (max:10 por instancia) para que escalar horizontalmente sea un
        numero conocido, no una sorpresa - ajustar segun el limite real del plan de BD contratado.
        */
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
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