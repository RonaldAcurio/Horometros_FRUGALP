'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('secciones', 'hacienda_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'haciendas', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('secciones', 'hacienda_id');
  },
};