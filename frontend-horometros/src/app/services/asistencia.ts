import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Operador{
    id: number;
    codigo_megued: string;
    nombre_completo: string;
    cedula?: string;
    telefono?: string;
    direccion?: string;
}

export interface Asistencia{
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
    //Apunta a las rutas que acabamos de montar en Express
    private apiUrl = environment.apuUrl.replace('/horometros','/asistencia');

    constructor( private http: HttpClient ){}

    crearOperador(operador: Partial<Operador>): Observable<Operador> {
        return this.http.post<Operador>(`${this.apiUrl}/operadores`, operador);
    }

    obtenerOperadores(): Observable<Operador[]>{
        return this.http.get<Operador[]>(`${this.apiUrl}/operadores`);
    }

    actualizarOperador(id:number, datos: Partial<Operador>): Observable<any>{
        return this.http.put(`${this.apiUrl}/operadores/${id}`, datos);
    }

    registrarMarcaQR(operadorId: number): Observable<any>{
        return this.http.post(`${this.apiUrl}/marcar-qr`,{ operador_id: operadorId});
    }

    obtenerAsistenciasHoy(): Observable<Asistencia[]>{
        return this.http.get<Asistencia[]>(`${this.apiUrl}/hoy`);
    }
}
