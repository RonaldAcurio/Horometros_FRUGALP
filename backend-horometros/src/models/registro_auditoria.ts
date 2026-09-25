import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

// Ver migracion 20260925020000 y CLAUDE.md ("Historial de auditoría") para el por que de cada campo.
export type AccionAuditoria =
    | 'RESETEAR_CLAVE_USUARIO'
    | 'RESETEAR_CLAVE_OPERADOR'
    | 'CAMBIAR_CREDENCIALES_OPERADOR'
    | 'GENERAR_TOKEN_HACIENDA'
    | 'INVALIDAR_TOKEN_HACIENDA';

export type ObjetivoAuditoria = 'usuario' | 'operador' | 'hacienda';

export class RegistroAuditoria extends Model<InferAttributes<RegistroAuditoria>, InferCreationAttributes<RegistroAuditoria>>{
    declare id: CreationOptional<number>;
    declare actor_usuario_id: number;
    declare accion: AccionAuditoria;
    declare objetivo_tipo: ObjetivoAuditoria;
    declare objetivo_id: number;
    // "Congelado" al momento de la accion, NO es un JOIN en vivo (ver migracion) - el historial no pierde
    // sentido si despues renombran/eliminan al objetivo.
    declare objetivo_nombre: string;
    // createdAt: Sequelize lo maneja solo via 'timestamps' (ver init() abajo) - mismo patron que Actividad/
    // RegistroActividad (models/actividad.ts), no hace falta declararlo aqui.
}

RegistroAuditoria.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        actor_usuario_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model: 'usuarios',
                key: 'id',
            },
        },
        accion:{
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        objetivo_tipo:{
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        objetivo_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        objetivo_nombre:{
            type: DataTypes.STRING(150),
            allowNull: false,
        },
    },
    {
        sequelize,
        modelName: 'RegistroAuditoria',
        tableName: 'registros_auditoria',
        timestamps: true,
        updatedAt: false, // append-only: una fila nunca se edita, no tiene sentido rastrear su "ultima modificacion".
    }
)
