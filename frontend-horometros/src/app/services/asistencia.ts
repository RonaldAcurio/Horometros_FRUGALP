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
    fecha: string;
    hora_ingreso: string;
    hora_salida?: string;
    estado: 'PRESENTE' | 'FINALIZADO';
    operador?: Operador;
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

    // POST -> https://.../api/asistencia/marcar-qr  (¡Atención: sin /asistencia repetido!)
    registrarMarcaQR(operadorId: number): Observable<any> {
        return this.http.post(`${this.baseUrl}/marcar-qr`, { operador_id: operadorId });
    }

    // GET -> https://.../api/asistencia/hoy  (¡Atención: sin /asistencia repetido!)
    obtenerAsistenciasHoy(): Observable<Asistencia[]> {
        return this.http.get<Asistencia[]>(`${this.baseUrl}/hoy`);
    }
}