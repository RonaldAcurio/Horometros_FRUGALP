'use strict';

/*
Pedido del usuario, 2026-10-30: re-subio una lista de 280 equipos que YA estaban cargados y "salieron
repitiendo todos". Causa real confirmada con pruebas en vivo: el UNIQUE de 'codigo_megued'/'nombre_equipo' en
Postgres distingue mayusculas de minusculas por defecto - "EQ-001" y "eq-001" son valores distintos para la
base, asi que ninguna de las dos reglas de negocio (en crearEquipo/importarEquipos, ver equipo.controller.ts)
detectaba la colision contra lo que ya existia. El chequeo que SI comparaba sin mayusculas/minusculas (dentro
del archivo que se esta importando en el momento) no ayuda cuando el duplicado es contra una fila que ya
estaba en la base de ANTES.

Decision del usuario (confirmada explicitamente): de aqui en adelante SOLO el codigo tiene que ser unico - el
nombre deja de tener esa restriccion (dos equipos pueden compartir nombre, con tal de que el codigo sea
distinto).

Esta migracion, en orden:
1) Deduplica 'codigo_megued' SIN importar mayusculas/minusculas, sobre TODAS las filas (incluidas las ya
   eliminadas via soft-delete, igual que el UNIQUE actual - ver describirColisionEquipo en el controller):
   agrupa por LOWER(codigo_megued) y dentro de cada grupo con mas de una fila, conserva UNA sola fila (la
   activa mas antigua si hay alguna activa, si no la mas antigua eliminada) y hace soft-delete (NO borra la
   fila, solo pone deletedAt - si una "de mas" ya estaba eliminada de antes, su deletedAt original NO se
   pisa, solo se le re-escribe el codigo) de las demas - mismo criterio ya usado en todo el resto del modulo
   Equipo (eliminarEquipo), para que cualquier RegistroActividad que ya haya quedado enganchado a una de esas
   filas "de mas" (creado durante la ventana en que el bug estuvo activo) siga funcionando igual, sin romper
   nada.
   Necesario ANTES del paso 3: Postgres rechaza crear un indice UNICO si ya existen filas que chocarian contra
   el - y como el indice nuevo sigue aplicando sobre TODAS las filas (igual que el UNIQUE actual, soft-deleted
   incluidas, a proposito, ver punto 3), el solo soft-delete NO alcanza para liberar el valor: la fila "de mas"
   SIGUE teniendo el mismo codigo_megued (solo cambia deletedAt), asi que seguiria chocando contra el indice
   para siempre. Por eso, a la fila que se descarta tambien se le reemplaza el codigo_megued por un marcador
   corto y unico ('DUP~' + su propio id, cabe de sobra en los 20 caracteres del campo) - nombre_equipo y el
   resto de sus datos quedan intactos, solo el codigo (que de todas formas ya era un duplicado accidental de
   carga, no un dato real distinto) deja de ocupar el valor real para que el equipo activo lo conserve.
2) Quita el UNIQUE de 'nombre_equipo' por completo (ya no es una regla de negocio).
3) Reemplaza el UNIQUE exacto de 'codigo_megued' (equipos_codigo_megued_key, nace asi tanto en una BD nueva via
   la migracion genesis como en produccion via '20260930160000-reparar-unique-equipos.js') por un indice UNICO
   sobre LOWER(codigo_megued) - mismo alcance de "aplica a todas las filas, incluidas las eliminadas" que el
   UNIQUE anterior, solo que ahora ignorando mayusculas/minusculas.
*/
module.exports = {
    async up(queryInterface) {
        // 1) Deduplicar por codigo, sin importar mayusculas/minusculas (ver explicacion arriba del criterio
        // de cual fila se conserva por grupo y por que ademas hace falta re-escribir el codigo_megued de las
        // que se descartan).
        await queryInterface.sequelize.query(`
            WITH grupos AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY LOWER(codigo_megued)
                        ORDER BY ("deletedAt" IS NULL) DESC, id ASC
                    ) AS prioridad
                FROM equipos
            )
            UPDATE equipos AS e
            SET "deletedAt" = COALESCE(e."deletedAt", NOW()),
                codigo_megued = 'DUP~' || e.id
            FROM grupos g
            WHERE e.id = g.id
              AND g.prioridad > 1;
        `);

        // 2) 'nombre_equipo' deja de ser unico.
        await queryInterface.removeConstraint('equipos', 'equipos_nombre_equipo_key').catch(() => {});

        // 3) 'codigo_megued' pasa de UNIQUE exacto a UNIQUE insensible a mayusculas/minusculas.
        await queryInterface.removeConstraint('equipos', 'equipos_codigo_megued_key').catch(() => {});
        await queryInterface.sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS equipos_codigo_megued_lower_key ON equipos (LOWER(codigo_megued));
        `);
    },

    async down(queryInterface) {
        // La deduplicacion (paso 1) no se revierte - no hay forma segura de "adivinar" si cada fila que se
        // dejo en soft-delete era de verdad un duplicado de carga o un equipo real distinto que coincidia de
        // casualidad, y tampoco tiene sentido querer reinstalar el bug de mayusculas/minusculas a proposito.
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS equipos_codigo_megued_lower_key;`);
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
};
