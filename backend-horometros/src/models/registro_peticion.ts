import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

// Ver migracion 20261005220000 para el por que de cada campo (historial de TODAS las peticiones, no solo
// acciones administrativas - distinto de RegistroAuditoria).
export class RegistroPeticion extends Model<InferAttributes<RegistroPeticion>, InferCreationAttributes<RegistroPeticion>>{
    declare id: CreationOptional<number>;
    declare metodo: string;
    declare ruta: string;
    declare status_code: number;
    declare duracion_ms: number;
    declare actor_tipo: CreationOptional<string | null>;
    declare actor_rol: CreationOptional<string | null>;
    declare actor_id: CreationOptional<number | null>;
    // createdAt: Sequelize lo maneja solo via 'timestamps' (ver init() abajo).
}

RegistroPeticion.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        metodo:{
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        ruta:{
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        status_code:{
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        duracion_ms:{
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        actor_tipo:{
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        actor_rol:{
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        actor_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'RegistroPeticion',
        tableName: 'registros_peticion',
        timestamps: true,
        updatedAt: false, // append-only, mismo patron que RegistroAuditoria.
    }
)
