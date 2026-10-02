'use strict';

/*
Marca EXPLICITA de que "Finalizar Jornada" realmente se ejecuto para una hacienda+fecha puntual - antes el
sistema entero (el flag `diaCerrado`, el bloqueo de nuevas entradas por QR/Token, el "congelado" de
observaciones/O-X, y el propio finalizarDia) INFERIA que un dia estaba cerrado con solo mirar que ya no
quedara ningun registro EN_JORNADA/PENDIENTE_REVISION sin confirmar - sin que el Supervisor hubiera tocado el
boton ni una sola vez. Bug real (pedido del usuario, 2026-10-02): si el UNICO trabajador del dia se autocerraba
("mi salida olvidada", autoservicio) y el Supervisor lo confirmaba (O) antes de darle a "Cerrar Jornada", el
sistema ya trataba ese dia como cerrado por su cuenta - el boton se bloqueaba, y si el Supervisor igual
intentaba cerrarlo le salia "ya fue cerrada anteriormente" sin que el cierre de verdad (incluida la
invalidacion del Token) se hubiera ejecutado nunca. Regla explicita del usuario: el Token (y el dia) solo
pierden vigencia cuando expira su cronometro normal, cuando se genera uno nuevo, o cuando "Finalizar Jornada"
corre de verdad - nunca solo porque todos ya hayan terminado por su cuenta, ni siquiera si es un solo
trabajador. Esta tabla es esa marca explicita: calcularDiaCerrado/calcularDiaCerradoHacienda (ver
asistencia.controller.ts) ahora consultan esto en vez de inferir del estado de las Asistencias.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cierres_jornada', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      hacienda_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'haciendas', key: 'id' },
      },
      fecha: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      cerrado_por_usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'usuarios', key: 'id' },
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
    // Una hacienda no puede cerrarse dos veces el mismo dia - esto es lo que hace que finalizarDia pueda usar
    // findOrCreate de forma segura sin duplicar filas.
    await queryInterface.addIndex('cierres_jornada', ['hacienda_id', 'fecha'], {
      unique: true,
      name: 'cierres_jornada_hacienda_fecha_unico',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('cierres_jornada');
  },
};
