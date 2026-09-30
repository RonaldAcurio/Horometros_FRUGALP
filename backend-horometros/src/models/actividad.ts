import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

export class Actividad extends Model < InferAttributes<Actividad>, InferCreationAttributes<Actividad>>{
    declare id: CreationOptional<number>;
    declare codigo_megued: string;
    declare description: string;
    declare categoria: CreationOptional<'TALLER' | 'CAMPO'>;
    // Declarado a proposito (a diferencia de antes) - importarActividades (actividades.controller.ts) lo
    // necesita leer con paranoid:false, mismo motivo que Equipo (ver models/equipo.ts).
    declare deletedAt: CreationOptional<Date | null>;
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
        categoria:{
            type: DataTypes.STRING(50),
            defaultValue: 'TALLER',
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'Actividad',
        tableName: 'actividades',
        timestamps: true,
        paranoid:true,
    }
)