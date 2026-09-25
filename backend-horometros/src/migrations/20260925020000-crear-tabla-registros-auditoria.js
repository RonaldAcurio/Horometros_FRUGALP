'use strict';

/*
Historial de acciones sensibles de ADMIN/ASISTENTE/SUPERVISOR (reseteo de claves, generar/invalidar Token de
Hacienda) - ver CLAUDE.md, "Historial de auditoría". Append-only: nunca se edita ni se borra una fila.
objetivo_nombre queda "congelado" en el momento de la accion (no es un JOIN en vivo) para que el historial siga
teniendo sentido aunque el nombre del operador/usuario/hacienda cambie despues. actor_usuario_id SI es un JOIN en
vivo contra 'usuarios' (ver models/index.ts) porque el nombre de quien ejecuta la accion practicamente nunca
cambia y evita cargar ese dato en cada escritura.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('registros_auditoria', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      actor_usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'usuarios', key: 'id' },
      },
      accion: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      objetivo_tipo: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      objetivo_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      objetivo_nombre: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
    await queryInterface.addIndex('registros_auditoria', ['createdAt']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('registros_auditoria');
  },
};
