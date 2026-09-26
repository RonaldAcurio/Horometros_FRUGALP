import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { RegistroActividadService } from './registro-actividad.service';
import { Equipo, Actividad } from '../models/asistencia.model';
import { OperacionCrearLabor, OperacionFinalizarLabor, OperacionPendiente } from '../models/offline.model';

const CLAVE_COLA = 'frugalp_cola_offline';

/*
Offline-first del Panel de Actividades (ver CLAUDE.md, diseño acordado: manual/periódico, no background sync
automático - iOS no lo permite de forma confiable de todas formas). Cuando el trabajador crea o finaliza una
labor sin señal, la operación se guarda acá (Preferences - sobrevive cierres de la app, a diferencia de
localStorage en Android) y se reintenta sola apenas vuelve la conexión (escuchando @capacitor/network) o cuando
el trabajador toca "Sincronizar ahora". mi-jornada.ts es el único consumidor hoy.
*/
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private registroActividadService = inject(RegistroActividadService);

  cola = signal<OperacionPendiente[]>([]);
  sincronizando = signal(false);
  // Arranca en true a propósito: mejor asumir "hay señal" y corregir al primer chequeo real que asumir
  // "sin señal" y mostrarle al trabajador un banner de offline que no corresponde.
  conectado = signal(true);

  // Notifica cualquier cambio en la cola (agregada, sincronizada, con error) - mi-jornada.ts se suscribe para
  // refrescar su vista combinada (servidor + pendientes) sin acoplarse a cómo se implementa el guardado.
  cambios$ = new Subject<void>();

  constructor() {
    this.cargar();
    this.iniciarDeteccionDeRed();
  }

  private async iniciarDeteccionDeRed(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const estado = await Network.getStatus();
      this.conectado.set(estado.connected);
      Network.addListener('networkStatusChange', (estado) => {
        this.conectado.set(estado.connected);
        if (estado.connected) this.sincronizar();
      });
    } else {
      this.conectado.set(navigator.onLine);
      window.addEventListener('online', () => { this.conectado.set(true); this.sincronizar(); });
      window.addEventListener('offline', () => this.conectado.set(false));
    }
  }

  private async cargar(): Promise<void> {
    const { value } = await Preferences.get({ key: CLAVE_COLA });
    if (!value) return;
    try {
      this.cola.set(JSON.parse(value));
    } catch {
      this.cola.set([]);
    }
  }

  private async guardar(): Promise<void> {
    await Preferences.set({ key: CLAVE_COLA, value: JSON.stringify(this.cola()) });
    this.cambios$.next();
  }

  pendientesCrearDeAsistencia(asistenciaId: number): OperacionCrearLabor[] {
    return this.cola().filter(
      (op): op is OperacionCrearLabor => op.tipo === 'crear_labor' && op.payload.asistencia_id === asistenciaId
    );
  }

  tieneFinalizacionPendiente(registroId: number): boolean {
    return this.cola().some((op) => op.tipo === 'finalizar_labor' && op.id === registroId);
  }

  async encolarCrearLabor(payload: OperacionCrearLabor['payload'], equipo?: Equipo, actividad?: Actividad): Promise<void> {
    const op: OperacionCrearLabor = {
      tipo: 'crear_labor',
      idLocal: -Date.now(),
      payload,
      equipo,
      actividad,
      creadoEn: new Date().toISOString(),
    };
    this.cola.update((c) => [...c, op]);
    await this.guardar();
  }

  async encolarFinalizarLabor(id: number, observaciones?: string, horaFin?: string, horometroFinal?: number): Promise<void> {
    const op: OperacionFinalizarLabor = {
      tipo: 'finalizar_labor',
      id,
      observaciones,
      horaFin,
      horometroFinal,
      creadoEn: new Date().toISOString(),
    };
    this.cola.update((c) => [...c, op]);
    await this.guardar();
  }

  async descartar(op: OperacionPendiente): Promise<void> {
    this.cola.update((c) => c.filter((o) => o !== op));
    await this.guardar();
  }

  /*
  Recorre la cola en orden (FIFO). Ante un fallo de RED (status 0 - la conexión se cayó a mitad de la
  sincronización) se corta todo el recorrido, el resto queda tal cual para el próximo intento. Ante un error
  REAL del servidor (400/404/etc - hubo señal pero el backend lo rechazó, ej. el equipo ya no existe) se marca
  ese ítem con su error y se sigue con el resto - no tiene sentido bloquear todo por uno solo que nunca va a
  poder sincronizar tal cual está.
  */
  async sincronizar(): Promise<void> {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    try {
      for (const op of this.cola()) {
        try {
          if (op.tipo === 'crear_labor') {
            await firstValueFrom(this.registroActividadService.crear(op.payload));
          } else {
            await firstValueFrom(
              this.registroActividadService.finalizar(op.id, op.observaciones, op.horaFin, op.horometroFinal)
            );
          }
          this.cola.update((c) => c.filter((o) => o !== op));
          await this.guardar();
        } catch (err: any) {
          if (err?.status === 0) {
            this.conectado.set(false);
            break;
          }
          this.cola.update((c) => c.map((o) => (o === op ? { ...o, error: err?.error?.message || 'No se pudo sincronizar.' } : o)));
          await this.guardar();
        }
      }
    } finally {
      this.sincronizando.set(false);
    }
  }
}
