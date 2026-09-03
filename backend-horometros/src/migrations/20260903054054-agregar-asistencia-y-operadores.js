'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // 1. MÉTODO UP: Aplica los cambios a la base de datos
  async up(queryInterface, Sequelize) {
    // A. Agregar columnas faltantes a la tabla 'operadores'
    await queryInterface.addColumn('operadores', 'cedula', {
      type: Sequelize.STRING(20),
      allowNull: true,
      unique: true
    });

    await queryInterface.addColumn('operadores', 'telefono', {
      type: Sequelize.STRING(20),
      allowNull: true
    });

    await queryInterface.addColumn('operadores', 'direccion', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    // B. Crear la nueva tabla 'asistencias'
    await queryInterface.createTable('asistencias', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      operador_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'operadores', // Tabla con la que se relaciona
          key: 'id'            // Llave primaria en la tabla de operadores
        },
        onUpdate: 'CASCADE',   // Si el id cambia, se actualiza en cascada
        onDelete: 'CASCADE'    // Si se elimina el operador, se borran sus asistencias
      },
      fecha: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      hora_ingreso: {
        type: Sequelize.DATE,
        allowNull: false
      },
      hora_salida: {
        type: Sequelize.DATE,
        allowNull: true
      },
      estado: {
        type: Sequelize.STRING(20),
        defaultValue: 'PRESENTE',
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  // 2. MÉTODO DOWN: Revierte exactamente los cambios hechos en el método UP
  async down(queryInterface, Sequelize) {
    // Eliminar la tabla de asistencias primero (por las llaves foráneas)
    await queryInterface.dropTable('asistencias');

    // Remover las columnas agregadas a 'operadores'
    await queryInterface.removeColumn('operadores', 'cedula');
    await queryInterface.removeColumn('operadores', 'telefono');
    await queryInterface.removeColumn('operadores', 'direccion');
  }
};