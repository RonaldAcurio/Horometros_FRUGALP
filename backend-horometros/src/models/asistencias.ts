import { DataTypes, Model, Optional, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

//1. Definimos la interfaz con TODOS los atributos de la tabla
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

export class Asistencia extends Model<AsistenciaAttributes, AsistenciaCreationAttributes> implements AsistenciaAttributes{
    declare id: CreationOptional<number>;
    declare operador_id: number;
    declare fecha: string;
    declare hora_ingreso: Date;
    declare hora_salida: Date;
    declare estado: 'PRESENTE' | 'FINALIZADO'
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
                model: 'operador',
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
        estado:{
            type: DataTypes.ENUM('PRESENTE', 'FINALIZADO'),
            allowNull: false,
            defaultValue: 'PRESENTE',
        }
    },
    {
        sequelize,
        modelName: 'Asistencia',
        tableName: 'asistencias',
        timestamps: true,
    }
)