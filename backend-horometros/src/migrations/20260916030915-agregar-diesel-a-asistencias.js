'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Diesel consumido: un solo valor por jornada (no por actividad), asi que va en 'asistencias'
  // y no en 'registro_actividades'. Nullable porque solo lo llenara el rol Operador (fase 2).
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('asistencias', 'diesel_consumido', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('asistencias', 'diesel_consumido');
  },
};