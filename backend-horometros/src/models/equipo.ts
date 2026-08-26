import {DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes} from 'sequelize';
import {sequelize} from '../config/database';

export class Equipo extends Model <InferAttributes<Equipo>, InferCreationAttributes<Equipo>> {
    declare id: CreationOptional<number>;
    declare codigo_megued: string;
    declare nombre_equipo: string;
    declare numero_hoja: string;
    declare tiene_tope_10k: boolean;
    declare ultimo_km_inicial: number;
    declare ultimo_real: number;
    declare nombre_maquinaria:CreationOptional<string | null>;
}

Equipo.init(
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
        nombre_equipo:{
            type: DataTypes.STRING(150),
            allowNull: false,
            unique: true,
        },
        numero_hoja:{
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        tiene_tope_10k:{
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ultimo_km_inicial:{
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00,
        },
        ultimo_real:{
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00,
        },
        nombre_maquinaria:{
            type: DataTypes.STRING(50)
        },
    },
    {
        sequelize,
        modelName: 'Equipo',
        tableName: 'equipos',
        timestamps: false,
    }
)