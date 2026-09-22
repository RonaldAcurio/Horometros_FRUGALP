import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

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
    declare hacienda_prestamo_id: CreationOptional<number | null>;
    declare admitido_por_usuario_id: CreationOptional<number | null>;
    // O/X del Supervisor: null = sin revisar, true = O (vino), false = X (no vino, ver confirmarAsistencia).
    declare confirmado_por_supervisor: CreationOptional<boolean | null>;
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
        hacienda_prestamo_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
            references:{
                model: 'haciendas',
                key:'id',
            },
        },
        admitido_por_usuario_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
            references:{
                model:'usuarios',
                key:'id',
            },
        },
        confirmado_por_supervisor:{
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: null,
        },
    },
    {
        sequelize,
        modelName: 'Asistencia',
        tableName: 'asistencias',
        timestamps: true,
    }
)