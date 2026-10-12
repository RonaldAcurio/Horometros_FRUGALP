'use strict';

/*
Area fija del trabajador (pedido del usuario, 2026-10-12): al crear un Operador se le asigna una Seccion de la
hacienda de su Supervisor (igual que ya elige supervisor_id), para no tener que pedirsela en cada labor del
Panel de Actividades - ver crearRegistroActividad en asistencia.controller.ts, que ahora hereda este valor
cuando el body no manda seccion_id explicito. 'secciones' ya existia desde antes (fase 2, sin CRUD/UI - ver
CLAUDE.md) como catalogo de sub-areas dentro de una hacienda; esto es lo primero que de verdad lo usa.
onDelete SET NULL (igual que registro_actividades.seccion_id): borrar una Seccion no debe borrar ni bloquear
al trabajador, solo deja su area en null hasta que le asignen otra.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('operadores', 'seccion_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'secciones', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('operadores', 'seccion_id');
  },
};
