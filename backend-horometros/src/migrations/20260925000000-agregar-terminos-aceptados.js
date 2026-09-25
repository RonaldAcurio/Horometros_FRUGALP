'use strict';

/*
Gate de aceptacion de la Politica de Privacidad / Terminos de Uso (ver CLAUDE.md): se pide una sola vez, en el
primer login de cada cuenta, y queda registrada aqui la fecha en que la acepto - null significa "todavia no
acepto" (el frontend bloquea con un modal hasta que lo haga, ver TerminosModal).
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('usuarios', 'terminos_aceptados_en', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operadores', 'terminos_aceptados_en', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'terminos_aceptados_en');
    await queryInterface.removeColumn('operadores', 'terminos_aceptados_en');
  },
};
