import { DataTypes, Model, Optional, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';
import { Operador } from './operador';
import { Actividad } from './actividad'; 
import { CreateAuthTokenConfig } from '@google/genai';

/*1. Definimos la interfaz con TODOS los atributos de la tabla
interface AsistenciaAttributes {
  id: number;
  operador_id: number;
  fecha: string;
  hora_ingreso: Date;
  hora_salida?: Date | null;
  estado: 'PRESENTE' | 'FINALIZADO';
}

// 2. Definimos cuáles son opcionales al CREAR (el 'id' es auto-incremental, 'hora_salida' es opcional)
interface AsistenciaCreationAttributes extends Optional<AsistenciaAttributes, 'id' | 'hora_salida'> {}
*/
export class Asistencia extends Model<InferAttributes<Asistencia>, InferCreationAttributes<Asistencia>>{
    declare id: CreationOptional<number>;
    declare operador_id: number;
    declare fecha: string;
    declare hora_ingreso: Date;
    declare hora_salida: CreationOptional<Date | null>;
    declare actividad_id: CreationOptional<number | null>;
    declare estado: CreationOptional<'EN_JORNADA' | 'PENDIENTE_REVISION' | 'FINALIZADO' | 'SALIDA_OLVIDADA' | 'OBSERVANDO'>;
    declare foto_ingreso: CreationOptional<string | null>;
    declare observaciones: CreationOptional<string | null>;
}

Asistencia.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        operador_id:{
            type: DataTypes.INTEGER,
            references:{
                model: 'operadores',
                key: 'id',
            },
        },
        fecha:{
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        hora_ingreso:{
            type: DataTypes.DATE,
            allowNull: false,
        },
        hora_salida:{
            type: DataTypes.DATE,
            allowNull: true,
        },
        actividad_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
            references:{
                model: 'actividades',
                key: 'id'
            },
        },
        estado:{
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'EN_JORNADA',
        },
        foto_ingreso:{
            type: DataTypes.TEXT,
            allowNull: true,
        },
        observaciones:{
            type: DataTypes.TEXT,
            allowNull: true
        },
    },
    {
        sequelize,
        modelName: 'Asistencia',
        tableName: 'asistencias',
        timestamps: true,
    }
)