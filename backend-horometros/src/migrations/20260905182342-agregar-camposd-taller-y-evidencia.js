'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Campos nuevos para la tabla 'operadores'
    await queryInterface.addColumn('operadores','rol', {
      type: Sequelize.STRING(20),
      defaultValue: 'MECANICO',
      allowNull: true
    }).catch(() => {});

    await queryInterface.addColumn('operadores','area', {
      type: Sequelize.STRING(100),
      defaultValue: 'MECANICO',
      allowNull: true
    }).catch(() => {});

    await queryInterface.addColumn('operadores','firma_url', {
      type: Sequelize.TEXT,
      allowNull: true
    }).catch(() => {});

    // 2. Campos nuecos para la tabla 'asistencia'
    await queryInterface.addColumn('asistencias','actividad_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'actividades',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    }).catch(() => {});

    await queryInterface.addColumn('asistencias','foto_ingreso', {
      type: Sequelize.TEXT,
      allowNull: true
    }).catch(() => {});

    await queryInterface.addColumn('asistencias','observaciones', {
      type: Sequelize.TEXT,
      allowNull: true
    }).catch(() => {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('asistencias','observaciones').catch(() => {});
    await queryInterface.removeColumn('asistencias','foto_ingreso').catch(() => {});
    await queryInterface.removeColumn('asistencias','actividad_id').catch(() => {});
    await queryInterface.removeColumn('operadores','firma_url').catch(() => {});
    await queryInterface.removeColumn('operadores','area').catch(() => {});
    await queryInterface.removeColumn('operadores','rol').catch(() => {});
  }
};
