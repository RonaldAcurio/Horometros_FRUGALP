import { describe, it, expect } from 'vitest';
import { tokenHaciendaVigente } from './token-hacienda';

describe('tokenHaciendaVigente', () => {
    const ahora = new Date('2026-09-25T12:00:00Z').getTime();

    it('no es vigente si no hay hacienda', () => {
        expect(tokenHaciendaVigente(null, ahora)).toBe(false);
        expect(tokenHaciendaVigente(undefined, ahora)).toBe(false);
    });

    it('no es vigente si nunca se genero un token (token_actual null)', () => {
        expect(
            tokenHaciendaVigente({ token_actual: null, token_expira_en: new Date(ahora + 1000) }, ahora)
        ).toBe(false);
    });

    it('no es vigente si falta la fecha de expiracion', () => {
        expect(tokenHaciendaVigente({ token_actual: 'abc123', token_expira_en: null }, ahora)).toBe(false);
    });

    it('no es vigente si el token ya vencio', () => {
        expect(
            tokenHaciendaVigente({ token_actual: 'abc123', token_expira_en: new Date(ahora - 1000) }, ahora)
        ).toBe(false);
    });

    it('no es vigente justo en el instante exacto de vencimiento', () => {
        expect(
            tokenHaciendaVigente({ token_actual: 'abc123', token_expira_en: new Date(ahora) }, ahora)
        ).toBe(false);
    });

    it('es vigente mientras no haya vencido', () => {
        expect(
            tokenHaciendaVigente({ token_actual: 'abc123', token_expira_en: new Date(ahora + 1) }, ahora)
        ).toBe(true);
    });

    it('sigue vigente segundos antes de cumplir las 24h (el caso real de uso)', () => {
        const generadoHaceCasi24h = ahora - (24 * 60 * 60 * 1000 - 5000);
        const expiraEn = new Date(generadoHaceCasi24h + 24 * 60 * 60 * 1000);
        expect(tokenHaciendaVigente({ token_actual: 'abc123', token_expira_en: expiraEn }, ahora)).toBe(true);
    });
});
