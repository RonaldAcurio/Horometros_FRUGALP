import { tokenHaciendaVencido, formatearTiempoRestante } from './token-hacienda.util';

describe('tokenHaciendaVencido', () => {
  const ahora = new Date('2026-09-25T12:00:00Z').getTime();

  it('no esta vencido si nunca se genero un token', () => {
    expect(tokenHaciendaVencido(null, null, ahora)).toBe(false);
  });

  it('no esta vencido si hay token pero sin fecha de expiracion', () => {
    expect(tokenHaciendaVencido('abc123', null, ahora)).toBe(false);
  });

  it('esta vencido si la fecha de expiracion ya paso', () => {
    expect(tokenHaciendaVencido('abc123', new Date(ahora - 1000).toISOString(), ahora)).toBe(true);
  });

  it('no esta vencido mientras falte tiempo', () => {
    expect(tokenHaciendaVencido('abc123', new Date(ahora + 1000).toISOString(), ahora)).toBe(false);
  });
});

describe('formatearTiempoRestante', () => {
  const ahora = new Date('2026-09-25T12:00:00Z').getTime();

  it('muestra un guion si no hay token', () => {
    expect(formatearTiempoRestante(null, ahora)).toBe('—');
  });

  it('muestra "Expirado" si la fecha ya paso', () => {
    expect(formatearTiempoRestante(new Date(ahora - 1000).toISOString(), ahora)).toBe('Expirado');
  });

  it('formatea HH:MM:SS con ceros a la izquierda', () => {
    const expiraEn = new Date(ahora + (2 * 3600 + 5 * 60 + 9) * 1000).toISOString();
    expect(formatearTiempoRestante(expiraEn, ahora)).toBe('02:05:09');
  });

  it('formatea correctamente cerca de las 24h (el caso real del Token de Hacienda)', () => {
    const expiraEn = new Date(ahora + 24 * 3600 * 1000).toISOString();
    expect(formatearTiempoRestante(expiraEn, ahora)).toBe('24:00:00');
  });
});
