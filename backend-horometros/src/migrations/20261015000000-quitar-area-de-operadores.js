'use strict';

/*
Limpieza (pedido del usuario, 2026-10-15): 'operadores.area' (STRING, default 'TALLER') quedo del diseno
original de la tabla y nunca se llego a usar - se confirmo con busquedas en todo el backend (controllers/rutas)
y en el formulario de Operador del frontend que ningun codigo la lee ni la escribe. No confundir con
'registro_actividades.area', que SI se usa activamente (es el campo de OT/Orden de Trabajo del MECANICO en cada
labor, ver registro_actividad.ts) - esa columna NO se toca aqui.
down() recrea la columna vacia (default 'TALLER', igual que su valor original) en vez de intentar restaurar lo
que tenia cada fila - mismo criterio que 20260925030000-cifrar-pii-operadores.js: para este punto el dato ya se
perdio con el up(), no hay nada real que recuperar.
*/
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('operadores', 'area');
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('operadores', 'area', {
      type: Sequelize.STRING(100),
      defaultValue: 'TALLER',
      allowNull: true,
    });
  },
};
