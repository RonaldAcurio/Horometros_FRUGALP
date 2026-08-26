import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

export class Actividad extends Model < InferAttributes<Actividad>, InferCreationAttributes<Actividad>>{
    declare id: CreationOptional<number>;
    declare codigo_megued: string;
    declare description: string;
}

Actividad.init(
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
        description:{
            type: DataTypes.STRING(150),
            allowNull: false,
        },
    },
    {
        sequelize,
        modelName: 'Actividad',
        tableName: 'actividades',
        timestamps: false,
    }
)