/*
Chequeo de vigencia del Token de Hacienda (24h, ver TOKEN_VIGENCIA_MS en hacienda.controller.ts) - antes vivia
repetido e inline en 3 sitios (login/auth.controller.ts, marcarConCodigo y marcarConMiCodigo en
asistencia.controller.ts), cada uno con su propia comparacion de fechas escrita a mano. Un solo lugar, puro
(sin Sequelize/Express), facil de probar y sin margen para que las 3 copias se desincronicen.
*/
export interface HaciendaConToken {
    token_actual: string | null;
    token_expira_en: Date | null;
}

export const tokenHaciendaVigente = (
    hacienda: HaciendaConToken | null | undefined,
    ahora: number = Date.now()
): boolean => {
    if(!hacienda || !hacienda.token_actual || !hacienda.token_expira_en) return false;
    return hacienda.token_expira_en.getTime() > ahora;
};
