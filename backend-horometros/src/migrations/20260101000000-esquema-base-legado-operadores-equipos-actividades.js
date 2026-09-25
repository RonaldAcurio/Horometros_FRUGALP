'use strict';

/*
GENESIS. 'operadores', 'equipos' y 'actividades' se crearon en producción ANTES de que existiera el sistema de
migraciones (via un sequelize.sync() antiguo - ver el comentario de
'20260916030830-reparar-primary-key-equipos.js', que ya documentaba esto para 'equipos'). Nunca quedaron
registradas como migración propia, así que migrar una base de datos REALMENTE vacía (una BD de test/CI nueva,
o una recuperación de desastre desde cero) fallaba: la primera migración tracked (20260903054054) intenta
ALTERAR estas 3 tablas asumiendo que ya existen.

Esta migración las crea con exactamente las columnas que NINGUNA migración tracked agrega después (verificado
columna por columna contra el esquema real de producción/desarrollo, cruzando contra cada migración
existente) - todo lo demás (cedula/telefono/direccion/rol/area/firma_url/supervisor_id/usuario/clave_hash/
timestamps de operadores, timestamps de equipos, etc.) lo siguen agregando las migraciones que ya existían,
sin tocarlas. Fechada 2026-01-01 (antes que cualquier otra) para correr primero.

IMPORTANTE: en tu base real (producción/desarrollo) estas 3 tablas YA EXISTEN. Como esta migración queda
fechada ANTES que las demás (que ya corrieron ahí), tu próximo `npm run db:migrate` la va a intentar correr -
createTable() sobre una tabla que ya existe REVENTARÍA con un error real si no se protegiera, cortando ese
migrate a la mitad. Por eso cada tabla se chequea primero (independiente una de otra) y se salta si ya existe -
en tu base real, las 3 quedan como no-op (se marca como corrida en SequelizeMeta sin tocar nada) y en una base
vacía (CI, o una recuperación de desastre desde cero) crea las 3 tablas de verdad.
*/
const tablaYaExiste = async (queryInterface, nombre) => {
    try {
        await queryInterface.describeTable(nombre);
        return true;
    } catch {
        return false;
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tablaYaExiste(queryInterface, 'operadores'))) {
            await queryInterface.createTable('operadores', {
                id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                },
                codigo_megued: {
                    type: Sequelize.STRING(20),
                    allowNull: false,
                    unique: true,
                },
                nombre_completo: {
                    type: Sequelize.STRING(150),
                    allowNull: false,
                },
                nombre_hoja: {
                    type: Sequelize.STRING(100),
                    allowNull: true,
                },
            });
        }

        if (!(await tablaYaExiste(queryInterface, 'equipos'))) {
            await queryInterface.createTable('equipos', {
                id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                },
                codigo_megued: {
                    type: Sequelize.STRING(20),
                    allowNull: false,
                    unique: true,
                },
                nombre_equipo: {
                    type: Sequelize.STRING(150),
                    allowNull: false,
                    unique: true,
                },
                // NOT NULL aca a proposito (asi nacio historicamente) - la migracion
                // '20260924010000-agregar-softdelete-equipos-operadores.js' ya se encarga de volverlo nullable.
                numero_hoja: {
                    type: Sequelize.STRING(20),
                    allowNull: false,
                },
                tiene_tope_10k: {
                    type: Sequelize.BOOLEAN,
                    allowNull: true,
                    defaultValue: false,
                },
                ultimo_km_inicial: {
                    type: Sequelize.DECIMAL(10, 2),
                    allowNull: true,
                    defaultValue: 0,
                },
                ultimo_real: {
                    type: Sequelize.DECIMAL(10, 2),
                    allowNull: true,
                    defaultValue: 0,
                },
                nombre_maquinaria: {
                    type: Sequelize.STRING(50),
                    allowNull: true,
                },
            });
        }

        if (!(await tablaYaExiste(queryInterface, 'actividades'))) {
            await queryInterface.createTable('actividades', {
                id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                },
                codigo_megued: {
                    type: Sequelize.STRING(20),
                    allowNull: false,
                    unique: true,
                },
                description: {
                    type: Sequelize.STRING(150),
                    allowNull: false,
                },
                categoria: {
                    type: Sequelize.STRING(50),
                    allowNull: true,
                    defaultValue: 'TALLER',
                },
                createdAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                },
                updatedAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                },
                deletedAt: {
                    type: Sequelize.DATE,
                    allowNull: true,
                },
            });
        }
    },
    async down(queryInterface) {
        // Sin proteccion de existencia aca a proposito: 'down' es un rollback deliberado, no algo que
        // db:migrate corra solo - si se invoca a mano, tiene que fallar ruidosamente si algo no cuadra.
        await queryInterface.dropTable('actividades');
        await queryInterface.dropTable('equipos');
        await queryInterface.dropTable('operadores');
    },
};
