import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Operador, Asistencia, Actividad, RespuestaPaginada } from '../models/asistencia.model';

@Injectable({
    providedIn: 'root'
})
export class AsistenciaService {
    // 1. Limpiamos '/horometros' para obtener la base limpia: 'https://horometros-frugalp.onrender.com/api'
    // Y le pegamos directo a la base del módulo de asistencia: 'https://horometros-frugalp.onrender.com/api/asistencia'
    private baseUrl = `${environment.apiUrl}/asistencia`;

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

    // PUT -> /api/asistencia/operadores/:id/clave (requiere JWT con rol ADMIN o ASISTENTE)
    resetearClaveOperador(id: number, clave: string): Observable<{ message: string }> {
        return this.http.put<{ message: string }>(`${this.baseUrl}/operadores/${id}/clave`, { clave });
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

    // PUT -> /api/asistencia/:id/confirmar (O/X del Supervisor: presente=true confirma, presente=false marca
    // ausente y pasa el registro a OBSERVANDO con una nota automática, ver backend).
    confirmarAsistencia(id: number, presente: boolean): Observable<any> {
        return this.http.put(`${this.baseUrl}/${id}/confirmar`, { presente });
    }

    // GET -> /api/actividades (Catálogo de actividades para la salida)
    // Nota: como está en la raíz de /api, construimos la URL reemplazando la ruta base
    obtenerActividades(): Observable<any[]> {
        const urlActividades = `${environment.apiUrl}/actividad`;
        return this.http.get<any[]>(urlActividades).pipe(
            catchError(err => {
                console.warn('Error al obtener actividades de /api/actividad: ',err);
                return of([]);//Retorna [] para que NO rompa las demas llamadas
            })
        );
    }

    // GET -> /api/actividad?pagina=1&limite=20 - paginado (mandar pagina/limite activa esa respuesta en el
    // backend, ver actividades.controller.ts), lo consume el selector del Panel de Actividades con "Cargar más".
    obtenerActividadesPaginado(pagina: number, limite: number): Observable<RespuestaPaginada<Actividad>> {
        const urlActividades = `${environment.apiUrl}/actividad`;
        return this.http.get<RespuestaPaginada<Actividad>>(urlActividades, { params: { pagina, limite } }).pipe(
            catchError(err => {
                console.warn('Error al obtener actividades paginadas de /api/actividad: ', err);
                return of({ data: [], total: 0, pagina, totalPaginas: 1 });
            })
        );
    }

    // GET -> https://.../api/asistencia/hoy?fecha=YYYY-MM-DD&pagina=1&limite=30
    // Paginado: al Supervisor tampoco le llega de golpe todo el dia de una sola vez.
    obtenerAsistenciasHoy(
        fecha?: string,
        pagina: number = 1,
        limite: number = 30
    ): Observable<{ data: Asistencia[]; total: number; pagina: number; totalPaginas: number; diaCerrado: boolean }> {
        let params = `?pagina=${pagina}&limite=${limite}`;
        if(fecha) params += `&fecha=${fecha}`;
        return this.http.get<{ data: Asistencia[]; total: number; pagina: number; totalPaginas: number; diaCerrado: boolean }>(
            `${this.baseUrl}/hoy${params}`
        );
    }

    //GET -> /api/asistencia/historial?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    obtenerHistorial(fechaInicio?: string, fechaFin?: string, pagina:number=1, limite:number=30
    ): Observable<{data:Asistencia[]; total:number; pagina:number; totalPaginas:number}>{
        let params = `?pagina=${pagina}&limite=${limite}`;
        if(fechaInicio && fechaFin){
            params = `?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
        } else if(fechaInicio){
            params = `?fecha_inicio=${fechaInicio}`;
        }

        return this.http.get<{data:Asistencia[]; total:number; pagina:number; totalPaginas:number}>(
            `${this.baseUrl}/historial${params}`);
    }

    // GET -> /api/asistencia/:id/foto (se pide UNICAMENTE cuando el usuario hace clic en "Ver Evidencia"
    // - los listados de arriba ya no traen la foto completa)
    obtenerFotoAsistencia(id:number):Observable<{ foto_ingreso:string }>{
        return this.http.get<{ foto_ingreso:string }>(`${this.baseUrl}/${id}/foto`);
    }

    // POST -> /api/asistencia/marcar-codigo (Camino A: hacienda con codigo activo, sin camara)
    marcarConCodigo(datos: {
        usuario: string; clave: string; token_hacienda: string;
        actividades_ids?: number[]; foto_ingreso?: string | null;
    }): Observable<any> {
        return this.http.post(`${this.baseUrl}/marcar-codigo`, datos);
    }

    // POST -> /api/asistencia/marcar-mi-codigo (Camino A para un Operador YA logueado, sin re-pedir su clave)
    marcarConMiCodigo(tokenHacienda: string, actividadesIds?: number[], fotoIngreso?: string | null): Observable<any> {
        return this.http.post(`${this.baseUrl}/marcar-mi-codigo`, {
            token_hacienda: tokenHacienda,
            actividades_ids: actividadesIds,
            foto_ingreso: fotoIngreso,
        });
    }

    // POST -> /api/asistencia/marcar-salida-olvidada (autoservicio: el trabajador cierra su propia jornada
    // cuando no puede volver a un punto de escaneo ni reingresar el codigo)
    marcarSalidaOlvidada(horaSalida?: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.baseUrl}/marcar-salida-olvidada`, { hora_salida: horaSalida });
    }

    // GET -> /api/asistencia/mi-qr (Camino B paso 1: el propio Operador pide su QR de jornada, vence en 90s)
    generarMiQr(): Observable<{ qr_token: string; vigencia_segundos: number }> {
        return this.http.get<{ qr_token: string; vigencia_segundos: number }>(`${this.baseUrl}/mi-qr`);
    }

    // GET -> /api/asistencia/mi-estado (el propio Operador consulta si ya tiene jornada EN_JORNADA hoy)
    obtenerMiEstado(): Observable<{ en_jornada: boolean; asistencia_id: number | null }> {
        return this.http.get<{ en_jornada: boolean; asistencia_id: number | null }>(`${this.baseUrl}/mi-estado`);
    }

    // POST -> /api/asistencia/marcar-qr-sesion (Camino B paso 2: SUPERVISOR/ESCANER escanean el QR de jornada)
    marcarConQrSesion(qrToken: string, actividadesIds?: number[], fotoIngreso?: string | null): Observable<any> {
        return this.http.post(`${this.baseUrl}/marcar-qr-sesion`, {
            qr_token: qrToken,
            actividades_ids: actividadesIds,
            foto_ingreso: fotoIngreso,
        });
    }
}