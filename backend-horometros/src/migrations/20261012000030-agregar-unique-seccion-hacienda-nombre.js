'use strict';

/*
Dos Secciones no pueden llamarse igual dentro de la MISMA hacienda (si pueden repetirse entre haciendas
distintas, por eso el UNIQUE es compuesto, no solo sobre 'nombre'). Seguro agregarlo ahora: la tabla 'secciones'
nunca tuvo CRUD hasta este cambio (ver CLAUDE.md, "fase 2"), asi que esta garantizado que esta vacia o sin
duplicados en produccion.
*/
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('secciones', ['hacienda_id', 'nombre'], {
      unique: true,
      name: 'secciones_hacienda_nombre_unico',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('secciones', 'secciones_hacienda_nombre_unico');
  },
};
