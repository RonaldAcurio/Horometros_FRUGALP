import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PerfilCuenta, RespuestaLogin, RolCuenta } from '../models/auth.model';

const CLAVE_TOKEN = 'frugalp_token';
const CLAVE_PERFIL = 'frugalp_perfil';

/*
Sesion del navegador: el JWT y el perfil se guardan en localStorage para sobrevivir un refresh de pagina.
No hay nada mas "secreto" que guardar aca - el JWT ya es la credencial completa, y el backend es quien de
verdad decide si sigue siendo valido en cada request (ver interceptor + el caso especial del Operador,
cuya sesion puede cortarse aunque el JWT no haya expirado por tiempo - CLAUDE.md, "Sesion del Operador").
*/
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  token = signal<string | null>(localStorage.getItem(CLAVE_TOKEN));
  perfil = signal<PerfilCuenta | null>(this.leerPerfilGuardado());

  estaAutenticado = computed(() => !!this.token());

  login(usuario: string, clave: string): Observable<RespuestaLogin> {
    return this.http.post<RespuestaLogin>(`${environment.apiUrl}/auth/login`, { usuario, clave }).pipe(
      tap((respuesta) => this.guardarSesion(respuesta))
    );
  }

  logout(): void {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_PERFIL);
    this.token.set(null);
    this.perfil.set(null);
    this.router.navigate(['/login']);
  }

  // Util para guards/menus: ¿el rol de la cuenta activa es alguno de estos?
  tieneRol(...roles: RolCuenta[]): boolean {
    const rol = this.perfil()?.rol;
    return !!rol && roles.includes(rol);
  }

  private guardarSesion(respuesta: RespuestaLogin): void {
    localStorage.setItem(CLAVE_TOKEN, respuesta.token);
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify(respuesta.perfil));
    this.token.set(respuesta.token);
    this.perfil.set(respuesta.perfil);
  }

  private leerPerfilGuardado(): PerfilCuenta | null {
    const crudo = localStorage.getItem(CLAVE_PERFIL);
    if (!crudo) return null;
    try {
      return JSON.parse(crudo) as PerfilCuenta;
    } catch {
      return null;
    }
  }
}
