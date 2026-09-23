import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Equipo, RegistroActividad, RespuestaPaginada } from '../models/asistencia.model';

// Panel de Actividades: labores puntuales dentro de la jornada abierta de un Operador/Mecanico (equipo,
// actividad, area/observaciones), mas el catalogo de Equipos que necesita el selector.
@Injectable({ providedIn: 'root' })
export class RegistroActividadService {
    private baseUrl = `${environment.apiUrl}/registro-actividades`;

    constructor(private http: HttpClient) {}

    // GET -> /api/equipos?pagina=1&limite=20 - paginado (el catalogo puede crecer), lo consume el selector del
    // Panel de Actividades con "Cargar más".
    obtenerEquipos(pagina: number, limite: number): Observable<RespuestaPaginada<Equipo>> {
        return this.http.get<RespuestaPaginada<Equipo>>(`${environment.apiUrl}/equipos`, {
            params: { pagina, limite },
        });
    }

    obtenerPorAsistencia(asistenciaId: number): Observable<RegistroActividad[]> {
        return this.http.get<RegistroActividad[]>(`${this.baseUrl}?asistencia_id=${asistenciaId}`);
    }

    // Historial de labores de UN operador a traves de varias jornadas (para el reporte imprimible "Ver/Imprimir"
    // del Panel de Asistente, mismo diseño que la hoja física "REPORTES DE LABORES DIARIOS").
    obtenerPorOperador(operadorId: number, fechaInicio?: string, fechaFin?: string): Observable<RegistroActividad[]> {
        let params = new HttpParams().set('operador_id', operadorId);
        if (fechaInicio) params = params.set('fecha_inicio', fechaInicio);
        if (fechaFin) params = params.set('fecha_fin', fechaFin);
        return this.http.get<RegistroActividad[]>(`${this.baseUrl}/por-operador`, { params });
    }

    // hora_inicio/hora_fin son opcionales - el trabajador puede registrar la labor mas tarde (en su tiempo
    // libre) y decir a que hora la hizo, en vez de que el backend le imponga el momento exacto del clic.
    crear(datos: {
        asistencia_id: number; equipo_id: number; actividad_id: number;
        area?: string; observaciones?: string; hora_inicio?: string;
    }): Observable<RegistroActividad> {
        return this.http.post<RegistroActividad>(this.baseUrl, datos);
    }

    finalizar(id: number, observaciones?: string, horaFin?: string): Observable<{ message: string; registro: RegistroActividad }> {
        return this.http.put<{ message: string; registro: RegistroActividad }>(`${this.baseUrl}/${id}/finalizar`, {
            observaciones,
            hora_fin: horaFin,
        });
    }
}
