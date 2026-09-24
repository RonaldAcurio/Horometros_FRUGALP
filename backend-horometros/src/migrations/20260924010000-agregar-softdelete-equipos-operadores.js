'use strict';

/*
Soft-delete (paranoid, mismo patron que ya usan 'actividades'/'secciones') para 'equipos' y 'operadores': el
Panel de Asistente gana pestañas de Equipo/Actividad con +Agregar/Editar/Eliminar, y el Directorio de Operadores
tambien gana Eliminar (hoy no tenia ninguna forma de dar de baja a un operador). "Eliminar" pone 'deleted_at',
nunca borra la fila - las Asistencias/RegistroActividad ya creadas siguen apuntando al mismo registro.

De paso, 'numero_hoja' de equipos pasa a admitir NULL: era un campo exclusivo del modulo Horometros ("numero de
hoja fisica" de la libreta de lecturas), obligatorio porque solo Horometros creaba equipos hasta ahora. Con el
Panel de Asistente creando equipos tambien (sin ese concepto), ya no puede seguir siendo NOT NULL.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    // camelCase a proposito: asi quedaron createdAt/updatedAt/deletedAt en 'actividades' (sin 'underscored' en
    // la config de Sequelize, ver models/actividad.ts) - se mantiene la misma convencion en toda la BD.
    await queryInterface.addColumn('equipos', 'createdAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('equipos', 'updatedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('equipos', 'deletedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.changeColumn('equipos', 'numero_hoja', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn('operadores', 'createdAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operadores', 'updatedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operadores', 'deletedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('equipos', 'createdAt');
    await queryInterface.removeColumn('equipos', 'updatedAt');
    await queryInterface.removeColumn('equipos', 'deletedAt');
    await queryInterface.removeColumn('operadores', 'createdAt');
    await queryInterface.removeColumn('operadores', 'updatedAt');
    await queryInterface.removeColumn('operadores', 'deletedAt');
  },
};
