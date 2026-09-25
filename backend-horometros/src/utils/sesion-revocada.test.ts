import { describe, it, expect } from 'vitest';
import { sesionFueInvalidada } from './sesion-revocada';

describe('sesionFueInvalidada', () => {
    it('nunca invalida si la cuenta jamas cambio su clave (sesion_valida_desde null)', () => {
        const iatDeHaceUnaSemana = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
        expect(sesionFueInvalidada(iatDeHaceUnaSemana, null)).toBe(false);
        expect(sesionFueInvalidada(iatDeHaceUnaSemana, undefined)).toBe(false);
    });

    it('no invalida si el token no tiene iat (nunca deberia pasar con jsonwebtoken, pero no revienta)', () => {
        expect(sesionFueInvalidada(undefined, new Date())).toBe(false);
    });

    it('invalida un token emitido ANTES del ultimo cambio de clave', () => {
        const sesionValidaDesde = new Date('2026-09-25T12:00:00Z');
        const iatUnaHoraAntes = Math.floor(sesionValidaDesde.getTime() / 1000) - 3600;
        expect(sesionFueInvalidada(iatUnaHoraAntes, sesionValidaDesde)).toBe(true);
    });

    it('NO invalida un token emitido DESPUES del ultimo cambio de clave (el que se logueo de nuevo)', () => {
        const sesionValidaDesde = new Date('2026-09-25T12:00:00Z');
        const iatUnaHoraDespues = Math.floor(sesionValidaDesde.getTime() / 1000) + 3600;
        expect(sesionFueInvalidada(iatUnaHoraDespues, sesionValidaDesde)).toBe(false);
    });

    it('no invalida un token emitido exactamente en el instante del cambio (limite: no es ANTERIOR)', () => {
        const sesionValidaDesde = new Date('2026-09-25T12:00:00Z');
        const iatExacto = Math.floor(sesionValidaDesde.getTime() / 1000);
        expect(sesionFueInvalidada(iatExacto, sesionValidaDesde)).toBe(false);
    });

    it('no invalida un login hecho en el MISMO segundo que el reseteo (bug real encontrado probando a mano: '
        + 'iat solo tiene resolucion de 1s, sesion_valida_desde tiene milisegundos)', () => {
        const sesionValidaDesde = new Date('2026-09-25T12:00:00.900Z'); // el reseteo cayo a los 900ms del segundo
        const iatMismoSegundo = Math.floor(sesionValidaDesde.getTime() / 1000); // login medio segundo despues, mismo segundo truncado
        expect(sesionFueInvalidada(iatMismoSegundo, sesionValidaDesde)).toBe(false);
    });
});
