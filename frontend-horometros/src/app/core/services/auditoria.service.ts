import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RegistroAuditoria } from '../models/auditoria.model';

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/auditoria`;

  obtenerAuditoria(): Observable<RegistroAuditoria[]> {
    return this.http.get<RegistroAuditoria[]>(this.baseUrl);
  }
}
