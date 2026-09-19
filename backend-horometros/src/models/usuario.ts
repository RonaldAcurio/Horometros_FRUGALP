import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

/*
Usuarios de oficina (ADMIN/ASISTENTE/SUPERVISOR). MECANICO/OPERDAOR No viven aqui: usan las columnas de usuario/clave_hash qie se agrega directo
a 'operadores', porque ya son la tabla que identifica a esa persona(codigo, cedula, QR) - separarlos duplicaria la identidad en 2 tablas.
*/
export class Usuario extends Model< InferAttributes<Usuario>, InferCreationAttributes<Usuario>>{
    declare id: CreationOptional<number>;
    declare nombre_completo: string;
    declare usuario: string;
    declare clave_hash: string;
    declare cargo: 'ADMIN' | 'ASISTENTE' | 'SUPERVISOR';
    declare activo: CreationOptional<boolean>;
    // Solo tiene sentido para cargo = SUPERVISOR (1 supervisor por hacienda, forzado por el UNIQUE de abajo: permite muchos NULL pero nunca repite
    //un mismo hacienda_id real).
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
            unique: false,
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