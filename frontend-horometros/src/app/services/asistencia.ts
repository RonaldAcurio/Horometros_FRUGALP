import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Operador {
    id: number;
    codigo_megued: string;
    nombre_completo: string;
    cedula?: string;
    telefono?: string;
    direccion?: string;
}

export interface Asistencia {
    id: number;
    operador_id: number;
    actividad_id?: number;
    fecha: string;
    hora_ingreso: string;
    hora_salida?: string;
    estado: 'EN_JORNADA' | 'PENDIENTE_REVISION' | 'FINALIZADO' | 'SALIDA_OLVIDADA';
    observaciones?: string;
    operador?: Operador;
    actividad?: {
        id: number;
        codigo_megued: string;
        description: string;
    };
}

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
    registrarMarcaQR(operadorId: number, actividadId?: number): Observable<any> {
        return this.http.post(`${this.baseUrl}/marcar`, { 
            operador_id: operadorId, 
            actividad_id: actividadId 
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
        const urlActividades = this.baseUrl.replace('/asistencia', '/actividades');
        return this.http.get<any[]>(urlActividades);
    }

    // GET -> https://.../api/asistencia/hoy  (¡Atención: sin /asistencia repetido!)
    obtenerAsistenciasHoy(): Observable<Asistencia[]> {
        return this.http.get<Asistencia[]>(`${this.baseUrl}/hoy`);
    }
}