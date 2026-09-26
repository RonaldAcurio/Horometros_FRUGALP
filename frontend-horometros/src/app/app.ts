import { Component, signal, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Toast } from './shared/toast/toast';
import { ConfirmModal } from './shared/confirm-modal/confirm-modal';
import { TerminosModal } from './shared/terminos-modal/terminos-modal';
import { AuthService } from './core/services/auth.service';
import { TerminosService } from './core/services/terminos.service';
import { rutaHomePorRol } from './core/utils/rutas-por-rol';

@Component({
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, Toast, ConfirmModal, TerminosModal],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend-horometros');
  private router = inject(Router);
  private location = inject(Location);
  protected authService = inject(AuthService);
  protected terminosService = inject(TerminosService);

  // Variables dinámicas para el botón del Header
  menuButtonText = 'Menú Principal';
  menuButtonLink = '/dashboard';
  // El header (con el botón de menú y la sesión) se oculta en /login: ahí no hay nada que navegar todavía.
  mostrarHeader = true;
  /*
  MECANICO/OPERADOR: pantalla cautiva a propósito (ver mi-jornada.ts) - no tienen a dónde más ir, así que no
  se les ofrece un botón "Menú" que no llevaría a ningún sitio útil. Solo "Cerrar sesión" sigue disponible
  (por si alguien se equivocó de cuenta).
  */
  mostrarBotonMenu = true;

  // Dropdown compacto de cuenta en el header (nombre/rol, Política, Menú, Cerrar sesión) - ver app.html.
  // No es un modal centrado: se cierra solo al tocar afuera (cuenta-overlay) o al navegar.
  menuCuentaAbierto = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const url = event.urlAfterRedirects || event.url;
        const perfil = this.authService.perfil();
        const home = rutaHomePorRol(perfil);

        this.mostrarHeader = url !== '/login';
        this.mostrarBotonMenu = perfil?.rol !== 'MECANICO' && perfil?.rol !== 'OPERADOR';
        this.menuCuentaAbierto.set(false);

        if (perfil?.rol === 'ESCANER') {
          // Unica excepcion propia: "Menú" siempre vuelve a /escaner (apaga la camara al salir de
          // /asistencia/escanear, ver ngOnDestroy de EscaneoSesion) - nunca hace falta en /escaner mismo.
          this.menuButtonText = 'Menú';
          this.menuButtonLink = home;
          this.mostrarBotonMenu = url !== home;
        } else if (url.startsWith('/asistencia/') && url !== '/asistencia') {
          // Vista interna de asistencia (asistente, marcación, supervisor o escaneo de sesión)
          this.menuButtonText = 'Menú';
          /*
          Solo ADMIN ve el menu de 3 tarjetas en /asistencia (asistenciaRedirectGuard manda a los demas
          roles directo a su propio panel, ver app.routes.ts) - para cualquier otro rol, "Menú" apuntando
          a /asistencia solo lo rebotaria de vuelta al mismo panel donde ya esta (no hace nada visible).
          Por eso el resto va directo a SU home.
          */
          this.menuButtonLink = this.authService.tieneRol('ADMIN') ? '/asistencia' : home;
        } else {
          this.menuButtonText = 'Menú Principal';
          this.menuButtonLink = home;
          this.mostrarBotonMenu = url !== home;
        }
      });

    this.registrarBotonAtrasSiAplica();
  }

  /*
  En el WebView de Capacitor, el botón/gesto "Atrás" de Android (incluido el deslizar desde el borde en
  Xiaomi/MIUI - usa el mismo mecanismo nativo) por defecto CIERRA la app en vez de navegar hacia atrás dentro
  de ella, porque el WebView no tiene historial de páginas reales (todo es una sola SPA de Angular) - se
  reportó probando el .apk real. @capacitor/app permite escuchar ese evento y decidir: si hay a dónde volver
  dentro de la app, se navega ahí (this.location.back()); si no hay más historial, se deja salir de la app
  (App.exitApp() - si no se llama nada, el back queda "muerto", no hace nada).

  Excepción a propósito: MECANICO/OPERADOR en el Panel de Actividades es una pantalla cautiva (ver
  mostrarBotonMenu arriba, mismo motivo) - ahí el botón/gesto Atrás se bloquea del todo (ni navega ni sale),
  para que no puedan volver por accidente a la pantalla de login en medio de una jornada.
  */
  private registrarBotonAtrasSiAplica(): void {
    if (!Capacitor.isNativePlatform()) return;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const perfil = this.authService.perfil();
      const esCautivo = perfil?.rol === 'MECANICO' || perfil?.rol === 'OPERADOR';
      if (esCautivo) return;

      if (canGoBack) {
        this.location.back();
      } else {
        CapacitorApp.exitApp();
      }
    });
  }

  cerrarSesion(): void {
    this.authService.logout();
  }
}
