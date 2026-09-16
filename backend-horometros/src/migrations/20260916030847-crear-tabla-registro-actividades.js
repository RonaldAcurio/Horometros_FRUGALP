'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Corazon del Panel de Actividades: una fila = una labor dentro de la jornada (asistencia)
  // de un Mecanico u Operador. Los campos de Operador (seccion_id, horometro_inicio/final) se
  // dejan nullable desde ya para no tener que migrar nada cuando se active ese rol en el futuro.
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('registro_actividades', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      asistencia_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'asistencias', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      equipo_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'equipos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      actividad_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'actividades', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      seccion_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'secciones', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      area: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      horometro_inicio: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      horometro_final: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      hora_inicio: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      hora_fin: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      observaciones: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // El panel siempre pide "todas las labores de esta jornada", asi que es la consulta mas
    // frecuente sobre esta tabla - sin indice, Postgres recorre la tabla completa cada vez.
    await queryInterface.addIndex('registro_actividades', ['asistencia_id'], {
      name: 'idx_registro_actividades_asistencia_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('registro_actividades');
  },
};