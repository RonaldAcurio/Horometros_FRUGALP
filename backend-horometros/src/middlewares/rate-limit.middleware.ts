import rateLimit from 'express-rate-limit';

/*
Sin esto, nada frenaba a alguien probando claves o codigos de hacienda a fuerza bruta - ver CLAUDE.md, checklist
de seguridad. Limita por IP, no por cuenta: un trabajador real que se equivoca de clave un par de veces no llega
ni cerca del limite, pero un script probando cientos de combinaciones si.
*/
export const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
});

// Mismo criterio para los endpoints publicos de marcacion (marcar-codigo, marcar-qr): tambien aceptan un dato
// que se podria adivinar a fuerza bruta (codigo de hacienda, operador_id), y son publicos (sin JWT).
export const limitadorMarcacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
});
