import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { RegistroActividadService } from './registro-actividad.service';
import { AsistenciaService } from './asistencia.service';
import { Equipo, Actividad } from '../models/asistencia.model';
import {
  OperacionCrearLabor,
  OperacionFinalizarLabor,
  OperacionSalidaOlvidada,
  OperacionFinalizarDia,
  OperacionPendiente,
} from '../models/offline.model';

const CLAVE_COLA = 'frugalp_cola_offline';
const CLAVE_CACHE_EQUIPOS = 'frugalp_cache_equipos';
const CLAVE_CACHE_ACTIVIDADES = 'frugalp_cache_actividades';

/*
Offline-first de las acciones que cierran una jornada (ver CLAUDE.md, diseño acordado: manual/periódico, no
background sync automático - iOS no lo permite de forma confiable de todas formas). Cuando el trabajador crea o
finaliza una labor, se autocierra (salida_olvidada) o un Supervisor cierra el día (finalizar_dia) sin señal, la
operación se guarda acá (Preferences - sobrevive cierres de la app, a diferencia de localStorage en Android) con
la hora del CLIC ya capturada, y se reintenta sola apenas vuelve la conexión (escuchando @capacitor/network) o
cuando se toca "Sincronizar ahora". Consumidores: mi-jornada.ts (crear_labor/finalizar_labor/salida_olvidada) y
supervisor-panel.ts (finalizar_dia).
*/
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private registroActividadService = inject(RegistroActividadService);
  private asistenciaService = inject(AsistenciaService);

  cola = signal<OperacionPendiente[]>([]);
  sincronizando = signal(false);
  // Arranca en true a propósito: mejor asumir "hay señal" y corregir al primer chequeo real que asumir
  // "sin señal" y mostrarle al trabajador un banner de offline que no corresponde.
  conectado = signal(true);

  /*
  Antes vivia duplicado, metodo por metodo identico, en mi-jornada.ts y supervisor-panel.ts (cada uno con su
  propio 'esFalloDeRed' privado). Bug real (2026-10-05): el chequeo `err.status === 0` solo no alcanza para
  detectar toda falla de red en un dispositivo real - se amplia con este mismo signal 'conectado' (el que ya
  pinta el banner "Sin conexión"): si el celular YA sabe que esta sin señal, cualquier error de una peticion
  HTTP es casi seguro de red, no una respuesta real del servidor.
  */
  esFalloDeRed(err: any): boolean {
    return err?.status === 0 || !this.conectado();
  }

  /*
  Catalogo COMPLETO de Equipo/Actividad, cacheado en el celular (Preferences, igual que la cola) para que el
  autocompletar del Panel de Actividades pueda buscar sin señal. Arranca con lo que haya quedado guardado de la
  ultima vez que hubo conexion (ver cargar()); se refresca solo cada vez que se detecta señal (ver
  iniciarDeteccionDeRed/refrescarCatalogos). Son catalogos chicos (equipos y actividades del negocio, no una
  tabla por trabajador) - cachearlos enteros es liviano y evita que buscar dependa de un viaje a red por cada
  letra que el trabajador escribe.
  */
  catalogoEquipos = signal<Equipo[]>([]);
  catalogoActividades = signal<Actividad[]>([]);

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
      if (estado.connected) this.refrescarCatalogos();
      Network.addListener('networkStatusChange', (estado) => {
        this.conectado.set(estado.connected);
        if (estado.connected) { this.sincronizar(); this.refrescarCatalogos(); }
      });
    } else {
      this.conectado.set(navigator.onLine);
      if (navigator.onLine) this.refrescarCatalogos();
      window.addEventListener('online', () => { this.conectado.set(true); this.sincronizar(); this.refrescarCatalogos(); });
      window.addEventListener('offline', () => this.conectado.set(false));
    }
  }

  private async cargar(): Promise<void> {
    const { value } = await Preferences.get({ key: CLAVE_COLA });
    if (value) {
      try {
        this.cola.set(JSON.parse(value));
      } catch {
        this.cola.set([]);
      }
    }

    const { value: valueEquipos } = await Preferences.get({ key: CLAVE_CACHE_EQUIPOS });
    if (valueEquipos) {
      try { this.catalogoEquipos.set(JSON.parse(valueEquipos)); } catch { /* cache corrupta, se ignora */ }
    }
    const { value: valueActividades } = await Preferences.get({ key: CLAVE_CACHE_ACTIVIDADES });
    if (valueActividades) {
      try { this.catalogoActividades.set(JSON.parse(valueActividades)); } catch { /* cache corrupta, se ignora */ }
    }
  }

  // Baja el catalogo COMPLETO de Equipo y Actividad y lo cachea localmente. Se llama solo/en silencio cada vez
  // que hay señal (ver iniciarDeteccionDeRed) - si falla (por ej. la señal se cae a mitad de la descarga) se
  // deja tal cual lo que ya estaba cacheado de antes, no rompe nada visible para el trabajador.
  async refrescarCatalogos(): Promise<void> {
    try {
      const [equipos, actividades] = await Promise.all([
        firstValueFrom(this.registroActividadService.obtenerTodosLosEquipos()),
        firstValueFrom(this.asistenciaService.obtenerTodasLasActividades()),
      ]);
      this.catalogoEquipos.set(equipos);
      this.catalogoActividades.set(actividades);
      await Preferences.set({ key: CLAVE_CACHE_EQUIPOS, value: JSON.stringify(equipos) });
      await Preferences.set({ key: CLAVE_CACHE_ACTIVIDADES, value: JSON.stringify(actividades) });
    } catch (err) {
      console.warn('No se pudo refrescar el catálogo de Equipo/Actividad:', err);
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

  // Como mucho una "salida olvidada" pendiente a la vez: es autoservicio del propio trabajador sobre su única
  // jornada abierta, no tiene sentido encolar dos (el usuario del boton no deja re-tocar mientras haya una).
  tieneSalidaOlvidadaPendiente(): boolean {
    return this.cola().some((op) => op.tipo === 'salida_olvidada');
  }

  async encolarSalidaOlvidada(horaSalida: string): Promise<void> {
    const op: OperacionSalidaOlvidada = { tipo: 'salida_olvidada', horaSalida, creadoEn: new Date().toISOString() };
    this.cola.update((c) => [...c, op]);
    await this.guardar();
  }

  // Mismo criterio que arriba: evita que el Supervisor encole dos cierres del mismo día/alcance por tocar el
  // botón más de una vez mientras el primero sigue sin sincronizar.
  tieneFinalizarDiaPendiente(fecha?: string, supervisorId?: number): boolean {
    return this.cola().some(
      (op) => op.tipo === 'finalizar_dia' && op.fecha === fecha && op.supervisorId === supervisorId
    );
  }

  async encolarFinalizarDia(horaCierre: string, fecha?: string, supervisorId?: number): Promise<void> {
    const op: OperacionFinalizarDia = { tipo: 'finalizar_dia', fecha, supervisorId, horaCierre, creadoEn: new Date().toISOString() };
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
          } else if (op.tipo === 'finalizar_labor') {
            await firstValueFrom(
              this.registroActividadService.finalizar(op.id, op.observaciones, op.horaFin, op.horometroFinal)
            );
          } else if (op.tipo === 'salida_olvidada') {
            await firstValueFrom(this.asistenciaService.marcarSalidaOlvidada(op.horaSalida));
          } else {
            await firstValueFrom(this.asistenciaService.finalizarDia(op.fecha, op.supervisorId, op.horaCierre));
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
