/*
Extraido de admin-panel.ts (Token de Hacienda, pestaña Haciendas) para poder probarlo sin TestBed ni Angular -
"ahora" siempre se recibe como parametro (nunca Date.now() adentro de estas funciones) justamente para que un
test pueda fijar un instante exacto en vez de depender del reloj real. El componente sigue siendo el dueño del
reloj (setInterval de 1s que recalcula "ahora" y fuerza change detection, ver admin-panel.ts).
*/
export const tokenHaciendaVencido = (
  tokenActual: string | null,
  tokenExpiraEn: string | null,
  ahora: number
): boolean => {
  if (!tokenActual || !tokenExpiraEn) return false;
  return new Date(tokenExpiraEn).getTime() - ahora <= 0;
};

export const formatearTiempoRestante = (tokenExpiraEn: string | null, ahora: number): string => {
  if (!tokenExpiraEn) return '—';
  const restanteMs = new Date(tokenExpiraEn).getTime() - ahora;
  if (restanteMs <= 0) return 'Expirado';
  const totalSegundos = Math.floor(restanteMs / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${dosDigitos(horas)}:${dosDigitos(minutos)}:${dosDigitos(segundos)}`;
};
