import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

export class Seccion extends Model<InferAttributes<Seccion>, InferCreationAttributes<Seccion>>{
    declare id: CreationOptional<number>;
    declare nombre: string;
    declare hacienda_id: number;
    // deletedAt SI se declara (igual que Equipo/Actividad/Operador) porque crearSeccion la necesita leer con
    // paranoid:false antes de insertar - el UNIQUE(hacienda_id, nombre) de la migracion sigue viendo ocupado
    // el nombre de una Seccion eliminada, aunque un findAll() normal no la muestre.
    declare deletedAt: CreationOptional<Date | null>;
}

Seccion.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        nombre:{
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        hacienda_id:{
            type: DataTypes.INTEGER,
            allowNull: false,
            references:{
                model: 'haciendas',
                key:'id',
            },
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'Seccion',
        tableName: 'secciones',
        timestamps: true,
        paranoid:true,
    }
);