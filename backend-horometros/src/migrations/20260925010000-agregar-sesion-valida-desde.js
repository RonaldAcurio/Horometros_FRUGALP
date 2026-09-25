'use strict';

/*
Revocacion de sesiones JWT (ver CLAUDE.md): el JWT es stateless (8h de vida), asi que "revocarlo" antes de su
vencimiento natural requiere un chequeo contra la BD. sesion_valida_desde = la fecha desde la cual un JWT emitido
ANTES de ese instante ya no sirve (se compara contra el "iat" del token, ver middlewares/auth.middleware.ts).
Se pisa con NOW() cada vez que cambia la clave de la cuenta - null (el default, todas las cuentas existentes)
significa "nunca se invalido nada", cualquier JWT sigue valido hasta su expiracion normal.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('usuarios', 'sesion_valida_desde', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operadores', 'sesion_valida_desde', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'sesion_valida_desde');
    await queryInterface.removeColumn('operadores', 'sesion_valida_desde');
  },
};
