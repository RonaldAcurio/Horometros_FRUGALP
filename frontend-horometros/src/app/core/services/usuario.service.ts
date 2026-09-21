import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NuevoUsuario, Usuario } from '../models/usuario.model';

// Todo este servicio pega contra /api/usuarios, exclusivo del Menu Admin (requiere JWT con rol ADMIN, ver backend).
@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/usuarios`;

  crearUsuario(datos: NuevoUsuario): Observable<Usuario> {
    return this.http.post<Usuario>(this.baseUrl, datos);
  }

  obtenerUsuarios(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(this.baseUrl);
  }

  resetearClave(id: number, clave: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/${id}/clave`, { clave });
  }
}
