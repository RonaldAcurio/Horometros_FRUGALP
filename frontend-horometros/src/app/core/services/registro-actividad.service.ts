import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Equipo, RegistroActividad } from '../models/asistencia.model';

// Panel de Actividades: labores puntuales dentro de la jornada abierta de un Operador/Mecanico (equipo,
// actividad, area/observaciones), mas el catalogo de Equipos que necesita el selector.
@Injectable({ providedIn: 'root' })
export class RegistroActividadService {
    private baseUrl = `${environment.apiUrl}/registro-actividades`;

    constructor(private http: HttpClient) {}

    obtenerEquipos(): Observable<Equipo[]> {
        return this.http.get<Equipo[]>(`${environment.apiUrl}/equipos`);
    }

    obtenerPorAsistencia(asistenciaId: number): Observable<RegistroActividad[]> {
        return this.http.get<RegistroActividad[]>(`${this.baseUrl}?asistencia_id=${asistenciaId}`);
    }

    crear(datos: {
        asistencia_id: number; equipo_id: number; actividad_id: number;
        area?: string; observaciones?: string;
    }): Observable<RegistroActividad> {
        return this.http.post<RegistroActividad>(this.baseUrl, datos);
    }

    finalizar(id: number, observaciones?: string): Observable<{ message: string; registro: RegistroActividad }> {
        return this.http.put<{ message: string; registro: RegistroActividad }>(`${this.baseUrl}/${id}/finalizar`, { observaciones });
    }
}
