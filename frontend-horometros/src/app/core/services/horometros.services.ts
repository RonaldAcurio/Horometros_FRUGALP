import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RespuestaLote, ConfirmarIngresoPayload, RespuestaConfirmacion } from '../models/horometro.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HorometrosService {
  private http = inject(HttpClient);
  //private apiUrl = 'http://localhost:3000/api/horometros'; // Ajusta según tu puerto backend
  private apiUrl = `${environment.apuUrl}/horometros`;

  // Subir hasta 6 imágenes en lote
  procesarLote(archivos: File[]): Observable<RespuestaLote> {
    const formData = new FormData();
    archivos.forEach((file) => {
      formData.append('imagenes', file);
    });
    return this.http.post<RespuestaLote>(`${this.apiUrl}/procesar-lote`, formData);
  }

  // Confirmar un registro ordenado individual
  confirmarIngreso(payload: ConfirmarIngresoPayload): Observable<RespuestaConfirmacion> {
    return this.http.post<RespuestaConfirmacion>(`${this.apiUrl}/confirmar-ingreso`, payload);
  }
}