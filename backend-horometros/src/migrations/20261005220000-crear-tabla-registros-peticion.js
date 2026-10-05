'use strict';

/*
Historial de TODAS las peticiones HTTP que llegan al servidor (pedido del usuario, 2026-10-05, tras un
incidente donde unos trabajadores no pudieron entrar con su token y no quedo ningun rastro en los logs de
Railway de quien fue ni por que). A diferencia de registros_auditoria (solo acciones administrativas puntuales,
ej. resetear una clave), esta tabla cubre cada peticion sin excepcion - incluidas las rechazadas (401/403) y las
de los endpoints publicos del kiosco (sin sesion). actor_* queda NULL cuando la peticion no tenia una sesion
valida (publica, o rechazada antes de identificar a nadie). Append-only, igual que registros_auditoria.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('registros_peticion', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      metodo: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      ruta: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      status_code: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      duracion_ms: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      // 'usuario' | 'operador' | null (sin sesion identificada en esta peticion)
      actor_tipo: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      // ADMIN/ASISTENTE/SUPERVISOR/ESCANER (actor_tipo='usuario') o MECANICO/OPERADOR (actor_tipo='operador')
      actor_rol: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      actor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
    await queryInterface.addIndex('registros_peticion', ['createdAt']);
    await queryInterface.addIndex('registros_peticion', ['actor_tipo', 'actor_id']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('registros_peticion');
  },
};
