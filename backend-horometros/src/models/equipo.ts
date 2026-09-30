import {DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes} from 'sequelize';
import {sequelize} from '../config/database';

export class Equipo extends Model <InferAttributes<Equipo>, InferCreationAttributes<Equipo>> {
    declare id: CreationOptional<number>;
    declare codigo_megued: string;
    declare nombre_equipo: string;
    declare numero_hoja: CreationOptional<string | null>;
    // Todas tienen defaultValue en el init() de abajo (exclusivas del modulo Horometros) - CreationOptional
    // porque crearEquipo (Panel de Asistente) no las pide, deja que caigan en su default.
    declare tiene_tope_10k: CreationOptional<boolean>;
    declare ultimo_km_inicial: CreationOptional<number>;
    declare ultimo_real: CreationOptional<number>;
    declare nombre_maquinaria: CreationOptional<string | null>;
    // createdAt/updatedAt: Sequelize los maneja solo via timestamps (ver init() abajo) - no hace falta
    // declararlos aqui. deletedAt SI se declara (a diferencia de antes) porque importarEquipos
    // (equipo.controller.ts) lo necesita leer explicitamente con paranoid:false, para detectar un
    // codigo_megued/nombre_equipo que perteneció a un equipo eliminado (el UNIQUE de Postgres sigue viendolo
    // ocupado aunque el soft-delete lo esconda de un findAll() normal).
    declare deletedAt: CreationOptional<Date | null>;
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
        // Exclusivo del modulo Horometros ("numero de hoja fisica" de la libreta de lecturas) - admite NULL
        // porque el Panel de Asistente tambien crea Equipos ahora (ver migracion 20260924010000) y ahi ese
        // concepto no aplica.
        numero_hoja:{
            type: DataTypes.STRING(20),
            allowNull: true,
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
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'Equipo',
        tableName: 'equipos',
        timestamps: true,
        paranoid: true,
    }
)