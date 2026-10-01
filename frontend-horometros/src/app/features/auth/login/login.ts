import { Component, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AuthService } from '../../../core/services/auth.service';
import { TerminosService } from '../../../core/services/terminos.service';
import { rutaHomePorRol } from '../../../core/utils/rutas-por-rol';

@Component({
  standalone: true,
  imports: [FormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  protected terminosService = inject(TerminosService);

  /*
  Botón "Descargar app" (pedido del usuario 2026-09-30): solo tiene sentido para alguien visitando la página
  desde un navegador normal (celular o computadora) - un trabajador que YA tiene la app empaquetada instalada
  no necesita verlo, ni tendría sentido "descargar el apk" desde DENTRO del apk mismo. Capacitor.isNativePlatform()
  ya se usa en el resto del proyecto para esta misma distinción (ver CLAUDE.md).
  */
  protected esNavegador = !Capacitor.isNativePlatform();

  usuario = '';
  clave = '';
  mostrarClave = signal(false);
  cargando = signal(false);
  // Error propio del formulario (persiste hasta el proximo intento) - distinto de una notificacion toast,
  // porque el usuario necesita verlo justo ahi, al lado de los campos que fallaron.
  errorLogin = signal<string | null>(null);

  ingresar(): void {
    if (!this.usuario || !this.clave || this.cargando()) return;

    this.cargando.set(true);
    this.errorLogin.set(null);

    this.authService.login(this.usuario.trim(), this.clave).subscribe({
      next: () => {
        this.cargando.set(false);
        // Cada rol tiene su propia "casa": ESCANER y MECANICO/OPERADOR NUNCA pasan por el Dashboard de
        // oficina (ver rutas-por-rol.ts) - evita el bug real de "todos terminan viendo el mismo menu".
        this.router.navigate([rutaHomePorRol(this.authService.perfil())]);
      },
      error: (err) => {
        this.cargando.set(false);
        this.errorLogin.set(err.error?.message || 'No se pudo iniciar sesión. Intenta de nuevo.');
      },
    });
  }
}
