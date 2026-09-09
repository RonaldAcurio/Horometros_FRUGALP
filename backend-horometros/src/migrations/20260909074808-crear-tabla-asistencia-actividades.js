'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('asistencia_actividades',{
      id:{
        type:Sequelize.INTEGER,
        autoIncrement:true,
        primaryKey: true,
      },
      asistencia_id:{
        type:Sequelize.INTEGER,
        allowNull:false,
        references:{
          model:'asistencias',
          key:'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      actividad_id:{
        type:Sequelize.INTEGER,
        allowNull:false,
        references:{
          model:'actividades',
          key:'id',
        },
        onUpdate:'CASCADE',
        onDelete:'RESTRICT',
      },
      createdAt:{
        type:Sequelize.DATE,
        allowNull:false,
      },
      updateAt:{
        type:Sequelize.DATE,
        allowNull:false,
      },
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('asistencia_actividades');
  }
};
