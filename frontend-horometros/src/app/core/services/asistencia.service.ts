import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Operador, Asistencia } from '../models/asistencia.model';

@Injectable({
    providedIn: 'root'
})
export class AsistenciaService {
    // 1. Limpiamos '/horometros' para obtener la base limpia: 'https://horometros-frugalp.onrender.com/api'
    // Y le pegamos directo a la base del módulo de asistencia: 'https://horometros-frugalp.onrender.com/api/asistencia'
    private baseUrl = `${environment.apuUrl}/asistencia`;

    constructor(private http: HttpClient) {}

    // POST -> https://.../api/asistencia/operadores
    crearOperador(operador: Partial<Operador>): Observable<Operador> {
        return this.http.post<Operador>(`${this.baseUrl}/operadores`, operador);
    }
    
    // GET -> https://.../api/asistencia/operadores
    obtenerOperadores(): Observable<Operador[]> {
        return this.http.get<Operador[]>(`${this.baseUrl}/operadores`);
    }

    // PUT -> https://.../api/asistencia/operadores/:id
    actualizarOperador(id: number, datos: Partial<Operador>): Observable<any> {
        return this.http.put(`${this.baseUrl}/operadores/${id}`, datos);
    }

    // POST -> /api/asistencia/marcar (soportando actividad_id para la salida)
    registrarMarcaQR(operadorId: number, actividadIds?: number[], fotoIngreso?: string | null): Observable<any> {
        return this.http.post(`${this.baseUrl}/marcar-qr`, { 
            operador_id: operadorId, 
            actividades_ids: actividadIds,
            foto_ingreso: fotoIngreso,
        });
    }

    // POST -> /api/asistencia/finalizar-dia (Cierre diario por supervisor)
    finalizarDia(fecha?: string): Observable<any> {
        return this.http.post(`${this.baseUrl}/finalizar-dia`, { fecha });
    }

    // PUT -> /api/asistencia/revisar/:id (Edición de observaciones/horas por supervisor)
    revisarAsistencia(id: number, datos: { hora_salida?: string; observaciones?: string; estado?: string; actividad_id?: number }): Observable<any> {
        return this.http.put(`${this.baseUrl}/revisar/${id}`, datos);
    }

    // GET -> /api/actividades (Catálogo de actividades para la salida)
    // Nota: como está en la raíz de /api, construimos la URL reemplazando la ruta base
    obtenerActividades(): Observable<any[]> {
        const urlActividades = `${environment.apuUrl}/actividad`;
        return this.http.get<any[]>(urlActividades).pipe(
            catchError(err => {
                console.warn('Error al obtener actividades de /api/actividad: ',err);
                return of([]);//Retorna [] para que NO rompa las demas llamadas
            })
        );
    }

    // GET -> https://.../api/asistencia/hoy?fecha=YYYY-MM-DD (fecha opcional)
    obtenerAsistenciasHoy(fecha?: string): Observable<Asistencia[]> {
        const params = fecha ? `?fecha=${fecha}` : '';
        return this.http.get<Asistencia[]>(`${this.baseUrl}/hoy${params}`);
    }
}