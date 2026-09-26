import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

// Ver migracion 20260926000000 y CLAUDE.md ("Auditoria MobSF") para el por que de cada campo.
export type ActorDispositivo = 'usuario' | 'operador';

export class RegistroDispositivo extends Model<InferAttributes<RegistroDispositivo>, InferCreationAttributes<RegistroDispositivo>>{
    declare id: CreationOptional<number>;
    declare actor_tipo: ActorDispositivo;
    declare actor_id: number;
    declare so_plataforma: string;
    declare so_version: CreationOptional<string | null>;
    declare modelo_dispositivo: CreationOptional<string | null>;
    // createdAt: Sequelize lo maneja solo via 'timestamps' (ver init() abajo) - mismo patron que RegistroAuditoria.
}

RegistroDispositivo.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        actor_tipo: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        actor_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        so_plataforma: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        so_version: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        modelo_dispositivo: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'RegistroDispositivo',
        tableName: 'registros_dispositivo',
        timestamps: true,
        updatedAt: false, // append-only: mismo motivo que RegistroAuditoria.
    }
)
