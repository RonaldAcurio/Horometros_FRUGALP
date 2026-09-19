'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('operadores', 'supervisor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('operadores', 'usuario', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('operadores', 'clave_hash', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('operadores', 'clave_hash');
    await queryInterface.removeColumn('operadores', 'usuario');
    await queryInterface.removeColumn('operadores', 'supervisor_id');
  },
};