import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Hacienda } from '../models/hacienda.model';

@Injectable({ providedIn: 'root' })
export class HaciendaService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/haciendas`;

  obtenerHaciendas(): Observable<Hacienda[]> {
    return this.http.get<Hacienda[]>(this.baseUrl);
  }

  generarToken(haciendaId: number): Observable<{ message: string; token_actual: string; token_expira_en: string }> {
    return this.http.post<{ message: string; token_actual: string; token_expira_en: string }>(
      `${this.baseUrl}/${haciendaId}/token`,
      {}
    );
  }

  invalidarToken(haciendaId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${haciendaId}/token`);
  }
}
