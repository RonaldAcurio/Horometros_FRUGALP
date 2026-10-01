'use strict';

/*
'operadores.cedula' quedo con DOS restricciones UNIQUE identicas (operadores_cedula_key y _key1) por una
columna agregada dos veces en el historial de migraciones (ver 20260903054054-agregar-asistencia-y-operadores.js,
que la agrego con unique:true, mas el modelo que tambien la declara unique - en algun momento ambas se
aplicaron). Las dos hacen exactamente lo mismo; ninguna se referencia por nombre en ningun lado del codigo
(confirmado por busqueda antes de este cambio). Se deja 'operadores_cedula_key' (el nombre que sigue la
convencion normal de Postgres: '<tabla>_<columna>_key') y se quita el duplicado '_key1'.
*/
module.exports = {
    async up(queryInterface) {
        await queryInterface.removeConstraint('operadores', 'operadores_cedula_key1').catch(() => {});
    },

    async down(queryInterface) {
        await queryInterface.addConstraint('operadores', {
            fields: ['cedula'],
            type: 'unique',
            name: 'operadores_cedula_key1',
        }).catch(() => {});
    },
};
