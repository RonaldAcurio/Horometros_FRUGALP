import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

/*
FASE A del arreglo de fondo del Token de Hacienda (ver MEMORY.md) - una fila por (hacienda_id, fecha), a
diferencia de 'haciendas.token_actual'/'token_expira_en' (un solo campo mutable, sin fecha propia). Por ahora
NADA lee de este modelo (ver migracion) - solo se escribe en doble escritura, junto a los 2 campos viejos.
*/
export class TokenHacienda extends Model<InferAttributes<TokenHacienda>, InferCreationAttributes<TokenHacienda>>{
    declare id: CreationOptional<number>;
    declare hacienda_id: number;
    declare fecha: string;
    declare token: string;
    declare expira_en: Date;
    declare activo: CreationOptional<boolean>;
    declare generado_por_usuario_id: number;
}

TokenHacienda.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        hacienda_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'haciendas', key: 'id' },
        },
        fecha: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        token: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,
        },
        expira_en: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        generado_por_usuario_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'usuarios', key: 'id' },
        },
    },
    {
        sequelize,
        modelName: 'TokenHacienda',
        tableName: 'tokens_hacienda',
        timestamps: true,
        /*
        Mismo indice que ya crea la migracion (tokens_hacienda_hacienda_fecha_unico) - declararlo tambien aca
        es lo que le permite a TokenHacienda.upsert() saber que el conflicto a resolver es (hacienda_id, fecha)
        y no 'token' (la otra columna unique, pero que SIEMPRE es un valor nuevo en cada llamada - sin esto,
        upsert() apuntaria su ON CONFLICT a la columna equivocada y la segunda escritura del mismo dia
        fallaria con un error de constraint real en vez de actualizar la fila). No dispara ninguna migracion:
        este proyecto nunca usa sequelize.sync(), solo migraciones - esto es puramente metadata para el ORM.
        */
        indexes: [
            { unique: true, fields: ['hacienda_id', 'fecha'] },
        ],
    }
);
