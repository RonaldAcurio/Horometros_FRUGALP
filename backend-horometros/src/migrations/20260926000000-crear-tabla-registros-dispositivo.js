'use strict';

/*
Registro liviano de que version de Android/iOS reporta cada login desde la app empaquetada (Capacitor) - ver
CLAUDE.md, "Auditoria MobSF": se bajo minSdk a 28 (Android 9) sin poder mapear a mano el parque real de
celulares de los ~950 trabajadores. Con esto, despues de una semana de uso real, se puede consultar la
distribucion real de versiones y ajustar minSdk con datos en vez de estimar. Append-only, igual que
registros_auditoria - nunca se edita ni se borra una fila. actor_tipo/actor_id: mismo patron polimorfico que
objetivo_tipo/objetivo_id en registros_auditoria (puede ser 'usuario' u 'operador', dos tablas distintas, no
se puede usar un solo FK). Solo se llama desde la app nativa (ver AuthService en el frontend) - el uso por
navegador normal no manda esto, no aporta nada a la decision de minSdk.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('registros_dispositivo', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      actor_tipo: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      actor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      so_plataforma: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      so_version: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      modelo_dispositivo: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
    await queryInterface.addIndex('registros_dispositivo', ['so_plataforma', 'so_version']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('registros_dispositivo');
  },
};
