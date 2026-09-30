'use strict';

/*
INCIDENTE (2026-09-30): un script de diagnostico propio, al limpiar equipos de prueba, uso el endpoint
GET /api/equipos?q=... SIN 'pagina'/'limite' - y ese endpoint (ver obtenerEquipos en equipo.controller.ts)
IGNORA 'q' cuando no hay paginacion, devolviendo el catalogo COMPLETO. El script interpreto esa lista completa
como "filas de prueba a borrar" y elimino (soft-delete, deletedAt) los 435 equipos reales del usuario, dejando
solo las 31 filas de prueba genuinas (codigo_megued = 'UNQCHK8942531'). Esta migracion restaura exactamente
esos 435 equipos reales (quita el deletedAt) y deja las filas de prueba como estaban: eliminadas.
La lista de ids viene del JSON exacto que devolvio la API justo antes del borrado masivo (se pudo reconstruir
sin ambiguedad porque los ids de las 31 filas de prueba, todas con el mismo codigo_megued 'UNQCHK8942531', se
excluyeron aparte).
*/
const IDS_A_RESTAURAR = [
    316, 317, 2, 3, 353, 354, 355, 248, 90, 91, 446, 380, 381, 382, 383, 384, 386, 387, 388, 443, 389, 390, 391,
    392, 393, 444, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412,
    413, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435,
    436, 437, 438, 439, 440, 441, 442, 445, 385, 414, 111, 4, 113, 5, 6, 114, 125, 28, 126, 29, 127, 30, 128, 31,
    129, 32, 130, 33, 131, 34, 132, 35, 133, 36, 134, 62, 143, 44, 144, 45, 145, 146, 47, 147, 48, 149, 50, 150,
    51, 151, 52, 152, 153, 154, 56, 155, 156, 157, 158, 159, 160, 161, 162, 69, 163, 67, 164, 165, 166, 167, 168,
    169, 170, 171, 172, 173, 46, 220, 17, 219, 18, 323, 333, 322, 328, 329, 330, 24, 201, 43, 141, 1, 142, 465,
    466, 467, 468, 469, 452, 315, 318, 319, 335, 218, 26, 202, 203, 21, 204, 20, 205, 206, 207, 208, 209, 210,
    211, 212, 217, 216, 340, 341, 342, 343, 344, 345, 196, 337, 338, 27, 269, 270, 271, 272, 273, 274, 214, 215,
    109, 110, 25, 112, 115, 7, 116, 117, 118, 9, 119, 10, 120, 11, 135, 37, 68, 121, 12, 122, 13, 320, 358, 123,
    124, 14, 15, 334, 359, 266, 199, 64, 200, 22, 472, 267, 268, 362, 363, 364, 365, 366, 367, 368, 369, 370,
    371, 372, 373, 374, 375, 376, 221, 222, 223, 224, 225, 226, 227, 229, 230, 231, 232, 233, 234, 235, 236, 237,
    238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 331, 463, 451, 449, 450, 307, 308, 309, 295, 310, 296, 311,
    297, 312, 298, 313, 299, 314, 300, 301, 302, 303, 304, 305, 306, 447, 378, 256, 257, 262, 263, 264, 258, 259,
    260, 261, 265, 339, 471, 460, 459, 453, 454, 275, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 276, 277,
    278, 279, 280, 281, 282, 283, 349, 350, 351, 352, 356, 379, 455, 456, 457, 377, 474, 357, 346, 448, 294, 332,
    336, 360, 361, 461, 253, 254, 255, 458, 470, 347, 321, 213, 462, 57, 58, 136, 38, 137, 66, 138, 39, 139, 40,
    140, 41, 148, 49, 53, 54, 55, 70, 63, 228, 348, 464, 19, 249, 250, 251, 252, 325, 324, 8, 197, 198, 473, 327,
    326, 59, 60, 71, 61, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190,
    191, 192, 193, 194, 195,
];

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(
            `UPDATE equipos SET "deletedAt" = NULL WHERE id IN (:ids) AND "deletedAt" IS NOT NULL`,
            { replacements: { ids: IDS_A_RESTAURAR }, type: Sequelize.QueryTypes.UPDATE }
        );
    },

    async down() {
        // No hay nada sensato que revertir - esta migracion corrige un borrado accidental.
    },
};
