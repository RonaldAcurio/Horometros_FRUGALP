'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Catalogo de secciones (sub-areas dentro de una hacienda, ej. un lote o sector especifico).
  // No lleva hacienda_id todavia porque la tabla 'haciendas' aun no existe en esta base de datos;
  // esa columna se agrega en una migracion aparte cuando se construya el modulo de Haciendas/Usuarios.
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('secciones', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      nombre: {
        type: Sequelize.STRING(100),
        allowNull: false,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('secciones');
  },
};