import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

export class RegistroActividad extends Model<InferAttributes<RegistroActividad>, InferCreationAttributes<RegistroActividad>>{
    declare id: CreationOptional<number>;
    declare asistencia_id: number;
    declare equipo_id: number;
    declare actividad_id: number;
    // ----------------------------------------Campos uso exclusivo de Mecanicos (por ahora)----------------------------------------
    declare area: CreationOptional<string | null>;
    //-----------------------------------------Campos uso exclusivo de Operador (fase 2, hoy quedan en NULL)------------------------
    declare seccion_id: CreationOptional<number | null>;
    declare horometro_inicio: CreationOptional<number | null>;
    declare horometro_final: CreationOptional<number | null>;
    //------------------------------------------Comunes en ambas roles---------------------------------------------------------------
    declare hora_inicio: Date;
    declare hora_fin: CreationOptional<Date | null>;
    //Campos compartidos: MECANICOS(OT)  y ek OPERADOR(IMPLEMENTOS) el frontend cambia la etiqueta segun el rol de quien inicio sesion
    declare observaciones: CreationOptional<string | null>;
}

RegistroActividad.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        asistencia_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model: 'asistencias',
                key: 'id',
            },
        },
        equipo_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model: 'equipos',
                key: 'id'
            },
        },
        actividad_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'actividades',
                key: 'id',
            },
        },
        seccion_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
            references:{
                model: 'actividades',
                key: 'id',
            },
        },
        area:{
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        horometro_inicio:{
            type: DataTypes.DECIMAL(10,2),
            allowNull: true,
        },
        horometro_final:{
            type: DataTypes.DECIMAL(10,2),
            allowNull:true,
        },
        hora_inicio: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        hora_fin:{
            type: DataTypes.DATE,
            allowNull: true,
        },
        observaciones:{
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'RegistroActividad',
        tableName: 'registro_actividades',
        timestamps: true,
    }
);