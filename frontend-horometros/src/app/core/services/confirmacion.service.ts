import { Injectable, signal } from '@angular/core';

export interface SolicitudConfirmacion {
  titulo: string;
  mensaje: string;
}

/*
Reemplaza a confirm(): igual que alert(), confirm() es un dialogo bloqueante del navegador que no se puede
stylear y no tiene sentido en una app empaquetada nativo. Este servicio guarda la pregunta actual en un signal
(la muestra <app-confirm-modal>, montado una sola vez en app.html) y devuelve una Promise<boolean> que se resuelve
cuando el usuario hace clic en Aceptar/Cancelar - se usa igual que confirm(), pero con "await" en vez de ser sincrono.
*/
@Injectable({ providedIn: 'root' })
export class ConfirmacionService {
  solicitud = signal<SolicitudConfirmacion | null>(null);
  private resolver: ((respuesta: boolean) => void) | null = null;

  preguntar(mensaje: string, titulo: string = 'Confirmar'): Promise<boolean> {
    this.solicitud.set({ titulo, mensaje });
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  responder(respuesta: boolean): void {
    this.solicitud.set(null);
    if (this.resolver) {
      this.resolver(respuesta);
      this.resolver = null;
    }
  }
}
