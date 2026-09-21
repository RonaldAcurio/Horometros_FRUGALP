'use strict';

/*
Antes: usuarios.hacienda_id tenia un UNIQUE de columna simple -> como mucho 1 Usuario (de cualquier cargo) por hacienda.
Ahora: ESCANER es un cargo nuevo (cuenta fija de un punto de control fisico) que tambien necesita 1 por hacienda, pero
coexistiendo con el Supervisor de esa misma hacienda. La solucion es reemplazar el UNIQUE plano por 2 indices UNIQUE
PARCIALES (uno que solo mira filas cargo='SUPERVISOR', otro que solo mira filas cargo='ESCANER'): cada uno sigue
garantizando "maximo 1 por hacienda" dentro de su propio cargo, pero ya no chocan entre si.
*/
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('usuarios', 'usuarios_hacienda_id_key');
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX usuarios_hacienda_id_supervisor_unico
      ON usuarios (hacienda_id)
      WHERE cargo = 'SUPERVISOR';
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX usuarios_hacienda_id_escaner_unico
      ON usuarios (hacienda_id)
      WHERE cargo = 'ESCANER';
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS usuarios_hacienda_id_escaner_unico;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS usuarios_hacienda_id_supervisor_unico;');
    await queryInterface.addConstraint('usuarios', {
      fields: ['hacienda_id'],
      type: 'unique',
      name: 'usuarios_hacienda_id_key',
    });
  },
};
