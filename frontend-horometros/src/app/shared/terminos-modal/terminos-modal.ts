import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { TerminosService } from '../../core/services/terminos.service';

/*
Un solo componente para los 2 modos en que aparece (ver CLAUDE.md):
- Bloqueante: la cuenta esta logueada y todavia no acepto (perfil().terminos_aceptados === false) - no se puede
  cerrar sin marcar el checkbox y presionar "Aceptar", aparece en cualquier pantalla porque vive en app.html.
- Libre: cualquiera lo abre desde el boton "Politica de Privacidad" (login o header, via TerminosService) solo
  para leerlo: se cierra con un boton normal y nunca toca terminos_aceptados.
*/
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-terminos-modal',
  styleUrl: './terminos-modal.css',
  templateUrl: './terminos-modal.html',
})
export class TerminosModal {
  protected authService = inject(AuthService);
  protected terminosService = inject(TerminosService);

  // Plano (no signal) a proposito: es el mismo patron que usan el resto de los checkboxes/inputs de formularios
  // en la app (ngModel sobre una propiedad simple, nunca sobre un signal directo).
  aceptado = false;
  guardando = signal(false);

  modoBloqueante = computed(
    () => this.authService.estaAutenticado() && this.authService.perfil()?.terminos_aceptados === false
  );
  mostrar = computed(() => this.modoBloqueante() || this.terminosService.mostrarLibre());

  aceptar(): void {
    if (!this.aceptado || this.guardando()) return;
    this.guardando.set(true);
    this.authService.aceptarTerminos().subscribe({
      next: () => this.guardando.set(false),
      error: () => this.guardando.set(false),
    });
  }

  cerrar(): void {
    this.terminosService.cerrar();
  }
}
