import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

export class AsistenciaActividad extends Model<InferAttributes<AsistenciaActividad>, InferCreationAttributes<AsistenciaActividad>>{
    declare id: CreationOptional<number>;
    declare asistencia_id:number;
    declare actividad_id:number;
}

AsistenciaActividad.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        asistencia_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model:'asistencias',
                key: 'id',
            },
        },
        actividad_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model:'actividades',
                key:'id',
            },
        },
    },
    {
        sequelize,
        modelName: 'AsistenciaActividad',
        tableName: 'asistencia_actividades',
        timestamps: true,
    }
);