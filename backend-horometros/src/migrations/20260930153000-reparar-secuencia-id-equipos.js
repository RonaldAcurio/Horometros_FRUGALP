'use strict';

/*
La tabla 'equipos' nacio via sync() ANTES de que existiera el sistema de migraciones (ver
'20260916030830-reparar-primary-key-equipos.js', que ya tuvo que reparar el PRIMARY KEY real que le faltaba).
El mismo origen historico dejo la SECUENCIA de 'id' desincronizada del valor real mas alto ya insertado (un
problema clasico de datos cargados o restaurados sin pasar por INSERTs normales, ej. un pg_dump/pg_restore como
el que se uso para migrar de Render a Railway - COPY no avanza la secuencia). Efecto real detectado en
produccion (2026-09-30): CADA intento de crear un Equipo (uno por uno o por Excel) fallaba con
SequelizeUniqueConstraintError, sin importar que codigo_megued/nombre_equipo se mandara - el motivo real
era que nextval() de la secuencia devolvia un id que YA EXISTIA, chocando contra el PRIMARY KEY, no contra
ningun UNIQUE de negocio. Esto se disfrazaba de "ya existe un equipo con ese código o nombre" porque
crearEquipo/importarEquipos solo revisan ese mensaje generico para SequelizeUniqueConstraintError.
Este fix es idempotente y seguro de correr en cualquier entorno (uno nuevo, con la tabla vacia, tambien queda
bien sincronizado).
*/
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(
            `SELECT setval(pg_get_serial_sequence('equipos', 'id'), COALESCE((SELECT MAX(id) FROM equipos), 1), true);`
        );
    },

    async down() {
        // No hay nada que revertir - reparar una secuencia desincronizada no es una operacion reversible
        // (ni tendria sentido volver a desincronizarla a proposito).
    },
};
