/*
Chequeo puro de revocacion de sesion (ver CLAUDE.md, "Revocacion de sesiones JWT"): un JWT tiene un "iat"
(issued at, SEGUNDOS desde epoch, sin decimales) que jsonwebtoken agrega solo al firmarlo. Si la cuenta cambio
su clave DESPUES de que ese JWT se emitio, el JWT quedo invalidado aunque su firma siga siendo valida y no haya
expirado por tiempo. Extraido de middlewares/auth.middleware.ts para poder probarlo sin Express ni una DB real.

Ambos lados se comparan en SEGUNDOS (no milisegundos): sesion_valida_desde se guarda con precision de
milisegundos, pero "iat" solo tiene resolucion de 1 segundo - comparar directo milisegundos-contra-segundos*1000
invalidaba por error un login legitimo hecho en el MISMO segundo que el reseteo (probado a mano: reset y login
inmediato caian en el mismo segundo, y el token nuevo quedaba marcado como viejo). Con ambos en segundos, un
login en ese mismo segundo ya no se confunde con el token de antes del cambio - el costo es la contrapartida
inevitable: un JWT viejo emitido en el mismo segundo que el reseteo (antes, por milisegundos) sigue colandose
hasta su expiracion natural. Ese margen de 1 segundo es aceptable frente al hueco real que esto cierra.
*/
export const sesionFueInvalidada = (
    iatSegundos: number | undefined,
    sesionValidaDesde: Date | null | undefined
): boolean => {
    if(!sesionValidaDesde || iatSegundos === undefined) return false;
    const sesionValidaDesdeSegundos = Math.floor(sesionValidaDesde.getTime() / 1000);
    return sesionValidaDesdeSegundos > iatSegundos;
};
