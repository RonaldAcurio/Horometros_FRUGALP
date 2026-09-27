'use strict';

/*
Bug real encontrado probando con OWASP ZAP (Active Scan) contra una base local recien migrada desde cero: GET
/api/asistencia/historial y GET /api/asistencia/hoy tiraban 500 (SequelizeDatabaseError, code 42703
"undefined_column") porque el include de Operador pide TODAS sus columnas por defecto, incluyendo
'nombre_hoja' - y esa base recien migrada no la tenia.

La migracion GENESIS (20260101000000-esquema-base-legado-operadores-equipos-actividades) SI declara
'nombre_hoja' al crear 'operadores' desde cero, pero solo corre ese createTable si la tabla TODAVIA no existe
(protegida asi a proposito, para no reventar contra produccion/desarrollo donde 'operadores' ya existia de
antes de que hubiera sistema de migraciones). En produccion/desarrollo esa proteccion hizo que el createTable
se saltara por completo (la tabla ya existia) - y aparentemente esa columna, pese a estar documentada en esa
migracion como "verificada contra el esquema real", nunca quedo agregada de verdad en algunas bases (asi haya
sido por una desincronizacion puntual entre lo documentado y lo real, un volumen de Docker con historial propio,
o cualquier otro motivo). En vez de asumir cual es el caso real de cada entorno, esta migracion se protege igual
que la GENESIS (revisa si la columna ya existe antes de agregarla) - asi es segura de correr sin importar si el
entorno ya la tenia o no.
*/
const columnaYaExiste = async (queryInterface, tabla, columna) => {
    const columnas = await queryInterface.describeTable(tabla);
    return Object.prototype.hasOwnProperty.call(columnas, columna);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await columnaYaExiste(queryInterface, 'operadores', 'nombre_hoja'))) {
            await queryInterface.addColumn('operadores', 'nombre_hoja', {
                type: Sequelize.STRING(100),
                allowNull: true,
            });
        }
    },
    async down(queryInterface) {
        if (await columnaYaExiste(queryInterface, 'operadores', 'nombre_hoja')) {
            await queryInterface.removeColumn('operadores', 'nombre_hoja');
        }
    },
};
