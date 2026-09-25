import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RespuestaAuditoria } from '../models/auditoria.model';

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/auditoria`;

  obtenerAuditoria(pagina: number = 1): Observable<RespuestaAuditoria> {
    return this.http.get<RespuestaAuditoria>(this.baseUrl, { params: { pagina } });
  }
}
