import { Equipo, Actividad } from './asistencia.model';

/*
Cola de operaciones pendientes de sincronizar (offline-first, ver OfflineSyncService). La ENTRADA (código o QR)
necesita ida y vuelta al servidor sí o sí (el código lo valida el backend contra el Token de Hacienda vigente,
el QR lo tiene que generar el servidor), así que ese paso siempre requiere señal. Pero CERRAR una jornada ya
abierta sí es offline-capaz, en 2 casos (pedido del usuario, 2026-10-05): el Panel de Actividades
(crear_labor/finalizar_labor, de siempre) y ahora también 'salida_olvidada' (el trabajador se autocierra) y
'finalizar_dia' (el Supervisor cierra el día) - en los 2 casos nuevos se guarda la hora del CLIC en el celular
(horaSalida/horaCierre) para que, al sincronizar, el servidor registre ESA hora y no la hora en que la petición
recién pudo viajar (que puede ser horas después, ver CLAUDE.md "offline-first: hora del clic vs hora del
servidor").

'crear_labor': idLocal es un id NEGATIVO inventado en el celular (nunca puede chocar con un id real de la
base de datos, que siempre es positivo) - sirve para poder mostrar la fila en el Panel de Actividades y para
que el usuario la identifique como "propia" mientras espera a que se sincronice. equipo/actividad ya vienen
resueltos desde los catálogos que el celular ya tenía cargados, para no depender del servidor para mostrarla.

'finalizar_labor': SOLO se puede encolar sobre un id REAL (positivo) - un registro creado mientras había señal,
o uno que ya se sincronizó. Si el registro todavía no se sincronizó (id negativo), la UI bloquea el botón
"Finalizar" hasta que le llegue su id real (ver mi-jornada.ts, tieneFinalizacionPendiente/idsSincronizando).
*/
export interface OperacionCrearLabor {
  tipo: 'crear_labor';
  idLocal: number;
  payload: {
    asistencia_id: number;
    equipo_id: number;
    actividad_id: number;
    area?: string;
    horometro_inicio?: number;
    observaciones?: string;
    hora_inicio?: string;
  };
  equipo?: Equipo;
  actividad?: Actividad;
  creadoEn: string;
  error?: string;
}

export interface OperacionFinalizarLabor {
  tipo: 'finalizar_labor';
  id: number;
  observaciones?: string;
  horaFin?: string;
  horometroFinal?: number;
  creadoEn: string;
  error?: string;
}

// Autoservicio del trabajador (mi-jornada.ts, marcarMiSalidaOlvidada) - horaSalida SIEMPRE viene puesta (es la
// hora del clic), a diferencia de hora_salida en el backend que es opcional para llamadas online directas.
export interface OperacionSalidaOlvidada {
  tipo: 'salida_olvidada';
  horaSalida: string;
  creadoEn: string;
  error?: string;
}

// Cierre de día del Supervisor (supervisor-panel.ts, ejecutarCierreDiario). fecha/supervisorId: mismos
// parámetros que ya acepta finalizarDia (ver asistencia.service.ts) - se guardan tal cual se mandaron en el
// clic, para reenviar la MISMA petición cuando vuelva la señal.
export interface OperacionFinalizarDia {
  tipo: 'finalizar_dia';
  fecha?: string;
  supervisorId?: number;
  horaCierre: string;
  creadoEn: string;
  error?: string;
}

export type OperacionPendiente =
  | OperacionCrearLabor
  | OperacionFinalizarLabor
  | OperacionSalidaOlvidada
  | OperacionFinalizarDia;
