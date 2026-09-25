import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database';

export class Operador extends Model <InferAttributes<Operador>, InferCreationAttributes<Operador>>{
    declare id: CreationOptional<number>;
    declare codigo_megued: string;
    declare nombre_completo: string;
    declare nombre_hoja: CreationOptional<string>;
    declare cedula: CreationOptional<string>;
    declare telefono: CreationOptional<string>;
    declare direccion: CreationOptional<string>;
    // ------- NUEVOS CAMPOS --------------
    declare rol: CreationOptional<'MECANICO' | 'OPERADOR'>;
    declare area: CreationOptional<string>;
    declare firma_url: CreationOptional<string>;
    //A que SUPERVISOR (y por lo lo tanto que hacienda) pertenece este trabajador de forma permanente
    declare supervisor_id: CreationOptional<number | null>;
    //Usuario+clave propios, ademas del QR fisico, Ambor juntos: o los datos o ninguno
    declare usuario: CreationOptional<string | null>;
    declare clave_hash: CreationOptional<string | null>;
    // null = todavia no acepto la Politica de Privacidad/Terminos de Uso (ver CLAUDE.md, gate de primer login).
    declare terminos_aceptados_en: CreationOptional<Date | null>;
    // createdAt/updatedAt/deletedAt: Sequelize los maneja solo via timestamps+paranoid (ver init() abajo),
    // mismo patron que Actividad (models/actividad.ts) - no hace falta declararlos aqui.
}

Operador.init(
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
        nombre_completo:{
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        nombre_hoja:{
            type: DataTypes.STRING(100),
        },
        cedula:{
            type: DataTypes.STRING(20),
            unique:true,
            allowNull:true,
        },
        telefono:{
            type: DataTypes.STRING(20),
            allowNull:true,
        },
        direccion:{
            type: DataTypes.STRING(255),
            allowNull:true,
        },
        rol:{
            type: DataTypes.STRING(20),
            defaultValue: 'MECANICO',
            allowNull: true,
        },
        area:{
            type: DataTypes.STRING(100),
            defaultValue: 'TALLER',
            allowNull: true
        },
        firma_url:{
            type: DataTypes.TEXT,
            allowNull: true
        },
        supervisor_id:{
            type: DataTypes.INTEGER,
            allowNull: true,
            references:{
                model:'usuarios',
                key: 'id',
            },
        },
        usuario:{
            type: DataTypes.STRING(50),
            allowNull: true,
            unique: true,
        },
        clave_hash:{
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        terminos_aceptados_en:{
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'Operador',
        tableName: 'operadores',
        timestamps: true,
        paranoid: true,
    }
)