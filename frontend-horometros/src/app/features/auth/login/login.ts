import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);

  usuario = '';
  clave = '';
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
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.cargando.set(false);
        this.errorLogin.set(err.error?.message || 'No se pudo iniciar sesión. Intenta de nuevo.');
      },
    });
  }
}
