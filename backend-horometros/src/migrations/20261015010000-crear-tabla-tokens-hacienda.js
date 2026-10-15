'use strict';

/*
FASE A (aditiva, cero riesgo) del arreglo de fondo del Token de Hacienda - ver MEMORY.md, "Token de Hacienda".
Hoy 'haciendas.token_actual'/'token_expira_en' son UN SOLO campo mutable por hacienda, sin fecha propia - el bug
real del 2026-10-08 (cerrar un dia atrasado invalidaba el token de HOY) solo quedo parchado (ver el bloque
'esHoy' en finalizarDia, asistencia.controller.ts), no resuelto de raiz. Esta tabla es el primer paso: una fila
por hacienda_id+fecha, para que "el token de tal dia" sea un dato real, no una inferencia.

En esta fase NADA lee de aqui todavia (login, marcarConCodigo, marcarConMiCodigo, obtenerHaciendas siguen
usando los 2 campos viejos de Hacienda exactamente igual que antes) - generarTokenHacienda/invalidarToken/
deshacerCierreJornada/finalizarDia solo escriben ACA ADEMAS de donde ya escribian, en doble escritura. Si algo
saliera mal, revertir el deploy no requiere ni un down() de verdad: esta tabla simplemente queda sin usarse.

UNIQUE(hacienda_id, fecha): una fila "vigente" por hacienda y dia - regenerar el token el MISMO dia hace UPDATE
de esa fila (no una fila nueva), igual que hoy se sobreescribe token_actual. 'token' sigue UNIQUE a nivel de
columna (ademas de hacienda_id+fecha) porque el kiosco/codigo publico busca solo por el string del token, sin
saber de antemano a que hacienda pertenece - mismo patron que Hacienda.token_actual hoy.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tokens_hacienda', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      hacienda_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'haciendas', key: 'id' },
      },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      token: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expira_en: { type: Sequelize.DATE, allowNull: false },
      // false = invalidado a mano (invalidarToken) o reemplazado por un token nuevo, antes de su vencimiento
      // natural - no se borra la fila, queda como historial de que existio y cuando dejo de servir.
      activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      generado_por_usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'usuarios', key: 'id' },
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('tokens_hacienda', ['hacienda_id', 'fecha'], {
      unique: true,
      name: 'tokens_hacienda_hacienda_fecha_unico',
    });

    /*
    Backfill de una sola vez (idempotente via ON CONFLICT DO NOTHING, mismo patron que
    20260925030000-cifrar-pii-operadores.js): si alguna hacienda ya tiene un token vigente HOY, se copia a la
    tabla nueva para no perderlo de vista - generado_por_usuario_id:1 es un placeholder de sistema solo para
    esta fila migrada (no se usa en ningun flujo real despues del backfill).
    */
    const [haciendas] = await queryInterface.sequelize.query(
      `SELECT id, token_actual, token_expira_en FROM haciendas WHERE token_actual IS NOT NULL`
    );
    for (const h of haciendas) {
      await queryInterface.sequelize.query(
        `INSERT INTO tokens_hacienda (hacienda_id, fecha, token, expira_en, activo, generado_por_usuario_id, "createdAt", "updatedAt")
         VALUES (:haciendaId, (:expira::timestamptz AT TIME ZONE 'America/Guayaquil')::date, :token, :expira, true, 1, NOW(), NOW())
         ON CONFLICT (hacienda_id, fecha) DO NOTHING`,
        { replacements: { haciendaId: h.id, token: h.token_actual, expira: h.token_expira_en } }
      );
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('tokens_hacienda');
  },
};
