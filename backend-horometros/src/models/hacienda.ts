import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

export class Hacienda extends Model<InferAttributes<Hacienda>, InferCreationAttributes<Hacienda>>{
    declare id: CreationOptional<number>;
    declare nombre: string;
    /*
    Token de Hacienda: habilita el escaneo QR de esa hacienda por 24h, No confundir con el JWT de sesion del Login(ese es
    stateless y no se guarda en la BD, ver clave_hash abajo). 
    */
   declare token_actual: CreationOptional<string | null>;
   declare token_espira_en: CreationOptional<string | null>;
}

Hacienda.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        nombre:{
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        token_actual:{
            type: DataTypes.STRING(64),
            allowNull: true,
            unique: true,
        },
        token_espira_en:{
            type: DataTypes.DATE,
            allowNull: true,
        },
    },{
        sequelize,
        modelName: 'Hacienda',
        tableName: 'haciendas',
        timestamps: true,
    }
);