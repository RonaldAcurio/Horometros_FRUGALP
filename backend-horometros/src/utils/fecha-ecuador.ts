/*
"Hoy" en la zona horaria de Ecuador, como 'YYYY-MM-DD' (mismo formato que la columna 'fecha' de Asistencia).
Antes vivia repetida e inline en 3 sitios (asistencia.controller.ts como 'getFetchLocalEcuador', auth.controller.ts
y auth.middleware.ts como 'getFechaLocalEcuador' - dos nombres distintos para la MISMA linea), cada uno con su
propia llamada a toLocaleDateString. Un solo lugar, facil de probar, sin margen para que las copias se
desincronicen si el dia cambia de criterio (otro locale, otra zona horaria, etc).
*/
export const obtenerFechaLocalEcuador = (ahora: Date = new Date()): string => {
    return ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Guayaquil' });
};
