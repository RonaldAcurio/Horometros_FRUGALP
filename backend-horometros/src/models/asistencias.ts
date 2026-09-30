import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { Operador } from './operador';

export class Asistencia extends Model<InferAttributes<Asistencia>, InferCreationAttributes<Asistencia>>{
    declare id: CreationOptional<number>;
    declare operador_id: number;
    // Solo presente cuando el include lo trae (ver index.ts, as:'operador') - no es una columna propia.
    declare operador?: NonAttribute<Operador>;
    declare fecha: string;
    declare hora_ingreso: Date;
    declare hora_salida: CreationOptional<Date | null>;
    declare actividad_id: CreationOptional<number | null>;
    declare estado: CreationOptional<'EN_JORNADA' | 'PENDIENTE_REVISION' | 'FINALIZADO' | 'SALIDA_OLVIDADA' | 'OBSERVANDO'>;
    declare foto_ingreso: CreationOptional<string | null>;
    // Key del objeto en Cloudflare R2 (ver r2.service.ts) - cuando esta presente, la foto real vive en R2 y
    // 'foto_ingreso' se deja null. Nullable porque los registros viejos (antes de R2) solo tienen foto_ingreso.
    declare foto_r2_key: CreationOptional<string | null>;
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
        foto_r2_key:{
            type: DataTypes.STRING(255),
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