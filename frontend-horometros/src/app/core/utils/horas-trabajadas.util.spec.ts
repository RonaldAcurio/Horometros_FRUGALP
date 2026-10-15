import { formatearHorasTrabajadas } from './horas-trabajadas.util';

describe('formatearHorasTrabajadas', () => {
  it('muestra un guion si no hay horas', () => {
    expect(formatearHorasTrabajadas(null)).toBe('—');
    expect(formatearHorasTrabajadas(undefined)).toBe('—');
  });

  it('muestra solo minutos si no llega a 1 hora (el caso real del usuario: 0.5h -> 30min)', () => {
    expect(formatearHorasTrabajadas(0.5)).toBe('30min');
  });

  it('muestra solo horas si los minutos son exactos', () => {
    expect(formatearHorasTrabajadas(1)).toBe('1h');
    expect(formatearHorasTrabajadas(12)).toBe('12h');
  });

  it('muestra horas y minutos combinados', () => {
    expect(formatearHorasTrabajadas(12.02)).toBe('12h 1min');
  });

  it('redondea al minuto mas cercano en vez de truncar', () => {
    // 1.99h = 119.4 min -> redondea a 119min = 1h 59min (no 1h 59min truncado por coincidencia, pero confirma
    // que no se pierde el minuto por Math.floor puro)
    expect(formatearHorasTrabajadas(1.99)).toBe('1h 59min');
  });

  it('cero horas muestra 0min, no un guion (hubo jornada pero sin labores con duracion real)', () => {
    expect(formatearHorasTrabajadas(0)).toBe('0min');
  });
});
