'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('asistencias', 'hacienda_prestamo_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'haciendas', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('asistencias', 'admitido_por_usuario_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('asistencias', 'admitido_por_usuario_id');
    await queryInterface.removeColumn('asistencias', 'hacienda_prestamo_id');
  },
};