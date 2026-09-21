import { Injectable, signal } from '@angular/core';

export type TipoNotificacion = 'exito' | 'error' | 'advertencia';

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  mensaje: string;
}

/*
Reemplaza a alert(): la app se va a empaquetar nativo, y alert() dibuja un dialogo del sistema operativo
(no se puede stylear, y en algunos wrappers nativos ni siquiera se ve bien). En su lugar, este servicio guarda
la notificacion actual en un signal; quien la muestra en pantalla es <app-toast> (montado una sola vez en app.html)
con clases de Tailwind, igual en todas las plataformas.
*/
@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private siguienteId = 0;
  private duracionMs = 4000;

  actual = signal<Notificacion | null>(null);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  exito(mensaje: string): void {
    this.mostrar('exito', mensaje);
  }

  error(mensaje: string): void {
    this.mostrar('error', mensaje);
  }

  advertencia(mensaje: string): void {
    this.mostrar('advertencia', mensaje);
  }

  cerrar(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.actual.set(null);
  }

  private mostrar(tipo: TipoNotificacion, mensaje: string): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.siguienteId += 1;
    this.actual.set({ id: this.siguienteId, tipo, mensaje });
    this.temporizador = setTimeout(() => this.actual.set(null), this.duracionMs);
  }
}
