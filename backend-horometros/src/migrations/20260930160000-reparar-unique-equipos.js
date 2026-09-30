'use strict';

/*
Igual que '20260916030830-reparar-primary-key-equipos.js': la tabla 'equipos' nacio via sync() antes de que
existiera el sistema de migraciones, y ese origen tambien dejo las restricciones UNIQUE de 'codigo_megued' y
'nombre_equipo' (declaradas en el modelo, pero nunca aplicadas de verdad en la BD de produccion). Efecto real
confirmado en produccion (2026-09-30), DESPUES de reparar la secuencia de 'id' (ver esa migracion): crear un
equipo con un codigo_megued/nombre_equipo YA EXISTENTE y activo se aceptaba sin error, creando un duplicado -
describirColisionEquipo/importarEquipos (equipo.controller.ts) nunca podian detectar nada porque Postgres
nunca tiraba SequelizeUniqueConstraintError para el caso de negocio (solo lo hacia por la colision de id/PK).
Se verifico contra el inventario real de produccion que NINGUN equipo real del usuario quedo duplicado (solo
las filas de prueba creadas durante este mismo diagnostico, ya borradas) - por eso es seguro aplicar el UNIQUE
directo, sin necesitar un paso de deduplicacion previo.
El catch es por lo mismo que en la migracion de PRIMARY KEY: una BD nueva (ej. la de CI, creada por la
migracion genesis) ya nace con estas UNIQUE reales desde el modelo - ahi el ADD CONSTRAINT chocaria contra
uno que ya existe, sin nada que reparar.
*/
module.exports = {
    async up(queryInterface) {
        await queryInterface.addConstraint('equipos', {
            fields: ['codigo_megued'],
            type: 'unique',
            name: 'equipos_codigo_megued_key',
        }).catch(() => {});

        await queryInterface.addConstraint('equipos', {
            fields: ['nombre_equipo'],
            type: 'unique',
            name: 'equipos_nombre_equipo_key',
        }).catch(() => {});
    },

    async down(queryInterface) {
        await queryInterface.removeConstraint('equipos', 'equipos_codigo_megued_key').catch(() => {});
        await queryInterface.removeConstraint('equipos', 'equipos_nombre_equipo_key').catch(() => {});
    },
};
