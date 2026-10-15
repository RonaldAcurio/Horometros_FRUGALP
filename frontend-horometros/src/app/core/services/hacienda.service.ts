import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Hacienda } from '../models/hacienda.model';

@Injectable({ providedIn: 'root' })
export class HaciendaService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/haciendas`;

  // PENDIENTE 1 (calendario de tokens, ver MEMORY.md): 'fecha' opcional para consultar el estado del token de
  // un dia distinto a hoy (el Supervisor Panel lo usa con su propio selector de fecha ya existente). Sin
  // 'fecha', se comporta igual que antes (el token de hoy).
  obtenerHaciendas(fecha?: string): Observable<Hacienda[]> {
    const url = fecha ? `${this.baseUrl}?fecha=${encodeURIComponent(fecha)}` : this.baseUrl;
    return this.http.get<Hacienda[]>(url);
  }

  crearHacienda(nombre: string): Observable<Hacienda> {
    return this.http.post<Hacienda>(this.baseUrl, { nombre });
  }

  // 'fecha' opcional (YYYY-MM-DD): genera el token de ese dia puntual en vez del de hoy. Sin 'fecha', igual que
  // antes (hoy).
  generarToken(
    haciendaId: number,
    fecha?: string
  ): Observable<{
    message: string;
    token_actual: string;
    token_expira_en: string;
    tokens_generados: { fecha: string; token: string; expira_en: string }[];
  }> {
    return this.http.post<{
      message: string;
      token_actual: string;
      token_expira_en: string;
      tokens_generados: { fecha: string; token: string; expira_en: string }[];
    }>(`${this.baseUrl}/${haciendaId}/token`, fecha ? { fecha } : {});
  }

  invalidarToken(haciendaId: number, fecha?: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${haciendaId}/token`, {
      body: fecha ? { fecha } : {},
    });
  }
}
