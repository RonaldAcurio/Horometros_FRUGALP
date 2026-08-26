import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';

export class Ingresos_Semanales extends Model <InferAttributes<Ingresos_Semanales>, InferCreationAttributes<Ingresos_Semanales>>{
    declare id: CreationOptional<number>;
    declare equipo_id: number;
    declare operador_id: number;
    declare actividad_id: number;
    declare seccion: string;
    declare FECHA_INGRESO: string;
    declare km_inicial: number;
    declare total_horas: number;
}

Ingresos_Semanales.init(
    {
        id:{
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        equipo_id:{
            type: DataTypes.INTEGER,
            references:{
                model:'equipos',
                key: 'id',
            },
        },
        operador_id:{
            type: DataTypes.INTEGER,
            references:{
                model:'operadores',
                key: 'id',
            },
        },
        actividad_id:{
            type: DataTypes.INTEGER,
            references:{
                model:'actividades',
                key: 'id',
            },
        },
        seccion:{
            type: DataTypes.STRING(20),
        },
        FECHA_INGRESO:{
            type: DataTypes.DATEONLY,
            field: 'fecha_ingreso',
            allowNull: false,
        },
        km_inicial:{
            type: DataTypes.DECIMAL(10,2),
            allowNull: false,
        },
        total_horas:{
            type: DataTypes.DECIMAL(10,2),
            allowNull: false,
        },
    },
    {
        sequelize,
        modelName: 'Ingresos_Semanales',
        tableName: 'ingresos_semanales',
        timestamps: false
    }
)