'use strict';

/*
Migracion a Cloudflare R2 para las fotos de evidencia (ver CLAUDE.md): hasta ahora 'foto_ingreso' guardaba la
imagen completa como base64 DENTRO de la fila de Postgres, lo que infla el tamano de la base de datos (el
recurso que se paga en el hosting) con cada foto. Esta columna nueva guarda solo la KEY del objeto en el bucket
R2 (ej: 'asistencias/42/1735689600000.jpg') - la imagen real vive en R2, la base solo sabe donde encontrarla.
'foto_ingreso' se deja intacta (no se borra ni se migra data existente aqui) para no romper registros viejos:
el codigo del backend lee primero 'foto_r2_key' y si no existe cae de vuelta a 'foto_ingreso' (compatibilidad
hacia atras).
*/
const columnaYaExiste = async (queryInterface, tabla, columna) => {
    const columnas = await queryInterface.describeTable(tabla);
    return Object.prototype.hasOwnProperty.call(columnas, columna);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await columnaYaExiste(queryInterface, 'asistencias', 'foto_r2_key'))) {
            await queryInterface.addColumn('asistencias', 'foto_r2_key', {
                type: Sequelize.STRING(255),
                allowNull: true,
            });
        }
    },
    async down(queryInterface) {
        if (await columnaYaExiste(queryInterface, 'asistencias', 'foto_r2_key')) {
            await queryInterface.removeColumn('asistencias', 'foto_r2_key');
        }
    },
};
