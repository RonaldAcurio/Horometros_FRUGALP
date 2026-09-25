import { Injectable, signal } from '@angular/core';

/*
Controla SOLO el modo "lectura libre" del modal de Terminos (boton "Politica de Privacidad" del header o del
login, fuera del flujo de aceptacion obligatoria). El modo obligatorio (cuenta logueada que todavia no acepto)
lo decide TerminosModal directo desde AuthService.perfil() - no pasa por aqui, asi que cerrar() nunca lo afecta.
*/
@Injectable({ providedIn: 'root' })
export class TerminosService {
  mostrarLibre = signal(false);

  abrir(): void {
    this.mostrarLibre.set(true);
  }

  cerrar(): void {
    this.mostrarLibre.set(false);
  }
}
