import { Equipo, Actividad } from './asistencia.model';

/*
Cola de operaciones pendientes de sincronizar (offline-first, ver OfflineSyncService). Solo el Panel de
Actividades (registro de labores dentro de una jornada ya abierta) es offline-capaz - la ENTRADA/SALIDA
(código o QR) necesita ida y vuelta al servidor sí o sí (el código lo valida el backend contra el Token de
Hacienda vigente, el QR lo tiene que generar el servidor), así que ese paso siempre requiere señal.

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

export type OperacionPendiente = OperacionCrearLabor | OperacionFinalizarLabor;
