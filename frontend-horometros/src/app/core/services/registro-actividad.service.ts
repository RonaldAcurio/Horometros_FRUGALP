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

    // GET -> /api/equipos?pagina=1&limite=20&q=... - paginado y filtrable por texto (codigo_megued/nombre_equipo).
    // Lo consumen tanto el autocompletar de Equipo del Panel de Actividades como la pestaña "Equipo" de gestión
    // del Panel de Asistente (Directorio/Historial/Equipo/Actividad, ver asistencia-panel.ts).
    obtenerEquipos(pagina: number, limite: number, q?: string): Observable<RespuestaPaginada<Equipo>> {
        let params = new HttpParams().set('pagina', pagina).set('limite', limite);
        if (q) params = params.set('q', q);
        return this.http.get<RespuestaPaginada<Equipo>>(`${environment.apiUrl}/equipos`, { params });
    }

    // POST/PUT/DELETE -> /api/equipos - gestión del catálogo (pestaña "Equipo" del Panel de Asistente).
    // DELETE es soft-delete (ver equipo.controller.ts): el equipo desaparece de los listados pero las labores
    // ya registradas que lo usaron lo siguen mostrando con normalidad.
    crearEquipo(datos: { codigo_megued: string; nombre_equipo: string }): Observable<Equipo> {
        return this.http.post<Equipo>(`${environment.apiUrl}/equipos`, datos);
    }

    actualizarEquipo(id: number, datos: { codigo_megued: string; nombre_equipo: string }): Observable<{ message: string; equipo: Equipo }> {
        return this.http.put<{ message: string; equipo: Equipo }>(`${environment.apiUrl}/equipos/${id}`, datos);
    }

    eliminarEquipo(id: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${environment.apiUrl}/equipos/${id}`);
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
