import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

export class Operador extends Model <InferAttributes<Operador>, InferCreationAttributes<Operador>>{
    declare id: CreationOptional<number>;
    declare codigo_megued: string;
    declare nombre_completo: string;
    declare nombre_hoja: CreationOptional<string>;
    declare cedula: CreationOptional<string>;
    declare telefono: CreationOptional<string>;
    declare direccion: CreationOptional<string>;
}

Operador.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        codigo_megued:{
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true,
        },
        nombre_completo:{
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        nombre_hoja:{
            type: DataTypes.STRING(100),
        },
        cedula:{
            type: DataTypes.STRING(20),
            unique:true,
            allowNull:true,
        },
        telefono:{
            type: DataTypes.STRING(20),
            allowNull:true,
        },
        direccion:{
            type: DataTypes.STRING(255),
            allowNull:true,
        },
    },
    {
        sequelize,
        modelName: 'Operador',
        tableName: 'operadores',
        timestamps: false,
    }
)