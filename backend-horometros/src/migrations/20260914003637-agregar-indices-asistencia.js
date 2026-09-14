'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Agrega indices sobre las columnas que mas se usan para filtrar (fecha del dia/historial,
  // y operador_id para saber si ya tiene una jornada abierta). Sin esto, Postgres tiene que
  // revisar la tabla completa fila por fila en cada consulta a medida que crece el historial.
  async up(queryInterface) {
    await queryInterface.addIndex('asistencias', ['fecha'], {
      name: 'idx_asistencias_fecha',
    });
    await queryInterface.addIndex('asistencias', ['operador_id'], {
      name: 'idx_asistencias_operador_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('asistencias', 'idx_asistencias_fecha');
    await queryInterface.removeIndex('asistencias', 'idx_asistencias_operador_id');
  },
};