import rateLimit from 'express-rate-limit';

/*
Sin esto, nada frenaba a alguien probando claves o codigos de hacienda a fuerza bruta - ver CLAUDE.md, checklist
de seguridad. Limita por IP, no por cuenta: un trabajador real que se equivoca de clave un par de veces no llega
ni cerca del limite, pero un script probando cientos de combinaciones si.

skip con NODE_ENV==='test': las pruebas de carga (ver CLAUDE.md, "Pruebas de carga") mandan cientos de
marcaciones DISTINTAS desde una sola maquina/IP a proposito (simulan 950 trabajadores, no 1) - en produccion
real cada trabajador pega desde su propio celular, asi que el limite por IP nunca los junta a todos. NODE_ENV
solo vale 'test' en pruebas de integracion/carga corridas a mano o en CI (ver database.ts) - nunca en produccion.
*/
export const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
    skip: () => process.env.NODE_ENV === 'test',
});

// Mismo criterio para los endpoints publicos de marcacion (marcar-codigo, marcar-qr): tambien aceptan un dato
// que se podria adivinar a fuerza bruta (codigo de hacienda, operador_id), y son publicos (sin JWT).
export const limitadorMarcacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
    skip: () => process.env.NODE_ENV === 'test',
});
