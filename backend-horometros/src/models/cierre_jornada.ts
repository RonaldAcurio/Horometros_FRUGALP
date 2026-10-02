import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

/*
Marca EXPLICITA de "Finalizar Jornada ya corrio para esta hacienda, en esta fecha" - ver migracion
20261002070000 para el por que. Append-only (una fila nunca se edita): una vez que una hacienda cierra un dia,
ese cierre no cambia. Una fila por (hacienda_id, fecha) - UNIQUE en la migracion.
*/
export class CierreJornada extends Model<
    InferAttributes<CierreJornada, { omit: 'createdAt' }>,
    InferCreationAttributes<CierreJornada, { omit: 'createdAt' }>
>{
    declare id: CreationOptional<number>;
    declare hacienda_id: number;
    declare fecha: string;
    declare cerrado_por_usuario_id: number;
    // Declarado (al reves que RegistroAuditoria) porque deshacerCierreJornada (asistencia.controller.ts) SI
    // necesita leerlo en codigo: marca el instante exacto del cierre, para ubicar que Asistencias toco ESE
    // cierre puntual (misma updatedAt del bulk UPDATE, unos ms antes) y asi no revertir nada de otro cierre.
    declare createdAt: CreationOptional<Date>;
}

CierreJornada.init(
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
        cerrado_por_usuario_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'usuarios', key: 'id' },
        },
    },
    {
        sequelize,
        modelName: 'CierreJornada',
        tableName: 'cierres_jornada',
        timestamps: true,
        updatedAt: false, // append-only, ver docstring arriba.
    }
)
