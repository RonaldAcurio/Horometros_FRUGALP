'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('haciendas', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      nombre: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      token_actual: { type: Sequelize.STRING(64), allowNull: true, unique: true },
      token_expira_en: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.bulkInsert('haciendas', [
      { nombre: 'Santa Clara', createdAt: new Date(), updatedAt: new Date() },
      { nombre: 'Rancho Brahman', createdAt: new Date(), updatedAt: new Date() },
      { nombre: 'Terranova', createdAt: new Date(), updatedAt: new Date() },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('haciendas');
  },
};