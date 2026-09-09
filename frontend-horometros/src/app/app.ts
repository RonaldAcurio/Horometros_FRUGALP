import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend-horometros');
  private router = inject(Router);

  // Variables dinámicas para el botón del Header
  menuButtonText = 'Menú Principal';
  menuButtonLink = '/dashboard';

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const url = event.urlAfterRedirects || event.url;

        // Si estamos en una vista interna de asistencia (asistente, marcación o supervisor)
        if (url.startsWith('/asistencia/') && url !== '/asistencia') {
          this.menuButtonText = 'Menú';
          this.menuButtonLink = '/asistencia';
        } else {
          // Para el Dashboard, Horómetros o el Menú Principal de Asistencia
          this.menuButtonText = 'Menú Principal';
          this.menuButtonLink = '/dashboard';
        }
      });
  }
}