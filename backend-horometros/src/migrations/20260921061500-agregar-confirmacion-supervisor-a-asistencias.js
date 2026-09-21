'use strict';

/*
O/X del Supervisor: al lado de cada trabajador que aparece logueado en su panel, el Supervisor confirma si
REALMENTE vino (O) o no (X). Null = todavia sin revisar. Sirve para atrapar el caso de que alguien pase su
codigo/QR a un compañero que no llego a trabajar.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('asistencias', 'confirmado_por_supervisor', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('asistencias', 'confirmado_por_supervisor');
  },
};
