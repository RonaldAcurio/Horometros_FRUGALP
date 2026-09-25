'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // La tabla 'equipos' en produccion se creo antes de que existieran las migraciones (via un
  // sync() antiguo) y nunca quedo con un PRIMARY KEY real en 'id', aunque el modelo de Sequelize
  // lo declare. Sin PRIMARY KEY, Postgres no deja crear una llave foranea que apunte a equipos.id
  // (por eso fallaba 'crear-tabla-registro-actividades'). Esta migracion repara eso antes de seguir.
  // El catch es porque una BD NUEVA (creada por la migracion genesis '20260101000000...', ej. la de CI) ya
  // nace con PK real - ahi este ADD CONSTRAINT chocaria contra uno que ya existe, sin nada que reparar.
  async up(queryInterface) {
    await queryInterface.addConstraint('equipos', {
      fields: ['id'],
      type: 'primary key',
      name: 'equipos_pkey',
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('equipos', 'equipos_pkey');
  },
};