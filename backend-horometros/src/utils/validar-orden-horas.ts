/*
Regla de negocio pedida explicitamente por el usuario: la hora de inicio de una labor NUEVA no puede quedar
antes de la ultima labor ya registrada ese dia en la misma jornada - evita que "Labores de hoy" quede
desordenada/inconsistente en el tiempo. Se compara contra hora_fin si la labor previa ya cerro, o contra su
hora_inicio si sigue abierta (y contra TODAS las labores, no solo la ultima creada, por si el trabajador cierra
una fuera de orden). Extraido de crearRegistroActividad (registro_actividad.controller.ts) para poder probarlo
sin tocar la base de datos ni Express.
*/
export interface RegistroPrevio {
    hora_inicio: Date;
    hora_fin: Date | null;
}

export const calcularUltimaHoraRegistrada = (registros: RegistroPrevio[]): number => {
    return registros.reduce((maxHasta, r) => {
        const horaRelevante = (r.hora_fin ?? r.hora_inicio).getTime();
        return horaRelevante > maxHasta ? horaRelevante : maxHasta;
    }, 0);
};

export const horaEsAnteriorARegistrosPrevios = (horaNueva: Date, registros: RegistroPrevio[]): boolean => {
    if(registros.length === 0) return false;
    return horaNueva.getTime() < calcularUltimaHoraRegistrada(registros);
};
