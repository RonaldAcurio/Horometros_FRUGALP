import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

/*
Usuarios de oficina (ADMIN/ASISTENTE/SUPERVISOR/ESCANER). MECANICO/OPERDAOR No viven aqui: usan las columnas de usuario/clave_hash qie se agrega directo
a 'operadores', porque ya son la tabla que identifica a esa persona(codigo, cedula, QR) - separarlos duplicaria la identidad en 2 tablas.

ESCANER: cuenta que se "activa" en un dispositivo de un punto de control fisico. Solo sirve para escanear/confirmar, esta atada a UNA
hacienda fija desde su creacion (igual que SUPERVISOR) - el login NUNCA deja elegir la hacienda, solo la muestra de forma
informativa, porque dejar elegir abriria la puerta a mezclar trabajadores de haciendas distintas por error o a proposito.
*/
export class Usuario extends Model< InferAttributes<Usuario>, InferCreationAttributes<Usuario>>{
    declare id: CreationOptional<number>;
    declare nombre_completo: string;
    declare usuario: string;
    declare clave_hash: string;
    declare cargo: 'ADMIN' | 'ASISTENTE' | 'SUPERVISOR' | 'ESCANER';
    declare activo: CreationOptional<boolean>;
    /*
    Solo tiene sentido para cargo = SUPERVISOR o cargo = ESCANER. Ya NO es un UNIQUE simple de columna: la migracion
    20260921... reemplaza el UNIQUE plano por dos indices UNIQUE parciales (uno por cada cargo), asi una misma hacienda
    puede tener a la vez 1 Supervisor y 1 Escaner, pero nunca 2 Supervisores ni 2 Escaneres.
    */
    declare hacienda_id: CreationOptional<number| null>;
}

Usuario.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        nombre_completo:{
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        usuario:{
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        clave_hash: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        cargo:{
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        activo:{
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        hacienda_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
            // El UNIQUE real vive en la BD como 2 indices parciales (ver migracion) - aqui NO se declara unique:true
            // porque Sequelize crearia un tercer indice (uno solo, sin distinguir cargo) que estorbaria.
            references:{
                model: 'haciendas',
                key: 'id',
            },
        },
    },{
        sequelize,
        modelName: 'Usuario',
        tableName:'usuarios',
        timestamps: true,
    }
);