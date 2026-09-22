import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Toast } from './shared/toast/toast';
import { ConfirmModal } from './shared/confirm-modal/confirm-modal';
import { AuthService } from './core/services/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, Toast, ConfirmModal],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend-horometros');
  private router = inject(Router);
  protected authService = inject(AuthService);

  // Variables dinámicas para el botón del Header
  menuButtonText = 'Menú Principal';
  menuButtonLink = '/dashboard';
  // El header (con el botón de menú y la sesión) se oculta en /login: ahí no hay nada que navegar todavía.
  mostrarHeader = true;

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const url = event.urlAfterRedirects || event.url;

        this.mostrarHeader = url !== '/login';

        // Si estamos en una vista interna de asistencia (asistente, marcación o supervisor)
        if (url.startsWith('/asistencia/') && url !== '/asistencia') {
          this.menuButtonText = 'Menú';
          /*
          Solo ADMIN ve el menu de 3 tarjetas en /asistencia (asistenciaRedirectGuard manda a los demas
          roles directo a su propio panel, ver app.routes.ts) - para cualquier otro rol, "Menú" apuntando
          a /asistencia solo lo rebotaria de vuelta al mismo panel donde ya esta (no hace nada visible).
          Por eso el resto va directo al Dashboard.
          */
          this.menuButtonLink = this.authService.tieneRol('ADMIN') ? '/asistencia' : '/dashboard';
        } else {
          // Para el Dashboard, Horómetros o el Menú Principal de Asistencia
          this.menuButtonText = 'Menú Principal';
          this.menuButtonLink = '/dashboard';
        }
      });
  }

  cerrarSesion(): void {
    this.authService.logout();
  }
}