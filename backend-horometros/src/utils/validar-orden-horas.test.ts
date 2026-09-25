import { describe, it, expect } from 'vitest';
import { calcularUltimaHoraRegistrada, horaEsAnteriorARegistrosPrevios } from './validar-orden-horas';

describe('horaEsAnteriorARegistrosPrevios', () => {
    it('nunca rechaza la primera labor del dia (sin registros previos)', () => {
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T08:00:00Z'), [])).toBe(false);
    });

    it('rechaza una hora anterior al fin de una labor ya cerrada', () => {
        const registros = [
            { hora_inicio: new Date('2026-09-25T08:00:00Z'), hora_fin: new Date('2026-09-25T09:00:00Z') },
        ];
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T08:30:00Z'), registros)).toBe(true);
    });

    it('acepta una hora posterior a la ultima labor cerrada', () => {
        const registros = [
            { hora_inicio: new Date('2026-09-25T08:00:00Z'), hora_fin: new Date('2026-09-25T09:00:00Z') },
        ];
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T09:30:00Z'), registros)).toBe(false);
    });

    it('compara contra hora_inicio cuando la labor previa sigue abierta (sin hora_fin todavia)', () => {
        const registros = [{ hora_inicio: new Date('2026-09-25T10:00:00Z'), hora_fin: null }];
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T09:00:00Z'), registros)).toBe(true);
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T10:30:00Z'), registros)).toBe(false);
    });

    it('compara contra la mas reciente de varias labores, no solo la ultima creada', () => {
        // El trabajador cerro una labor fuera de orden (la segunda de la lista termino antes que la primera).
        const registros = [
            { hora_inicio: new Date('2026-09-25T08:00:00Z'), hora_fin: new Date('2026-09-25T09:00:00Z') },
            { hora_inicio: new Date('2026-09-25T07:00:00Z'), hora_fin: new Date('2026-09-25T07:30:00Z') },
        ];
        expect(calcularUltimaHoraRegistrada(registros)).toBe(new Date('2026-09-25T09:00:00Z').getTime());
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T08:45:00Z'), registros)).toBe(true);
    });

    it('acepta una hora exactamente igual a la ultima registrada (limite: no es ANTERIOR)', () => {
        const registros = [
            { hora_inicio: new Date('2026-09-25T08:00:00Z'), hora_fin: new Date('2026-09-25T09:00:00Z') },
        ];
        expect(horaEsAnteriorARegistrosPrevios(new Date('2026-09-25T09:00:00Z'), registros)).toBe(false);
    });
});
