/*
"Horas Trabajadas" del Historial de Asistencias (pedido del usuario, 2026-10-15): antes se mostraba el decimal
crudo que manda el backend (ej. "0.5 h", "12.02 h") - confuso para alguien que no piensa en horas con
fracciones. Se convierte a "Xh Ymin" (ej. "30min", "12h 1min"), mas legible para una hoja de asistencia.
Deliberadamente SIN segundos: el backend ya redondea total_horas a 2 decimales (ver obtenerHistorial en
asistencia.controller.ts) antes de que esto lo reciba, asi que cualquier segundo que se "reconstruyera" desde
ese decimal ya redondeado seria precision inventada, no un dato real.
*/
export const formatearHorasTrabajadas = (horas: number | null | undefined): string => {
  if (horas == null) return '—';
  const totalMinutos = Math.round(horas * 60);
  const h = Math.floor(totalMinutos / 60);
  const min = totalMinutos % 60;
  if (h <= 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}min`;
};
