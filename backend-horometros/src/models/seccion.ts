import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

export class Seccion extends Model<InferAttributes<Seccion>, InferCreationAttributes<Seccion>>{
    declare id: CreationOptional<number>;
    declare nombre: string;
    declare hacienda_id: number;
}

Seccion.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        nombre:{
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        hacienda_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model: 'haciendas',
                key:'id',
            },
        },
    },
    {
        sequelize,
        modelName: 'Seccion',
        tableName: 'secciones',
        timestamps: true,
        paranoid:true,
    }
);