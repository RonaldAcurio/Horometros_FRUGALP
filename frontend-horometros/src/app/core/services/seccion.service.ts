import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Seccion } from '../models/seccion.model';

@Injectable({ providedIn: 'root' })
export class SeccionService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/secciones`;

  obtenerSecciones(haciendaId: number): Observable<Seccion[]> {
    return this.http.get<Seccion[]>(this.baseUrl, { params: { hacienda_id: haciendaId } });
  }

  crearSeccion(nombre: string, haciendaId: number): Observable<Seccion> {
    return this.http.post<Seccion>(this.baseUrl, { nombre, hacienda_id: haciendaId });
  }

  actualizarSeccion(id: number, nombre: string): Observable<{ message: string; seccion: Seccion }> {
    return this.http.put<{ message: string; seccion: Seccion }>(`${this.baseUrl}/${id}`, { nombre });
  }

  eliminarSeccion(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`);
  }
}
