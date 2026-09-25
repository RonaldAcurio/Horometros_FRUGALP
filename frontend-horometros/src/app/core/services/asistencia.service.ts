import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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
    
    // GET -> https://.../api/asistencia/operadores?pagina=1&limite=20&q=... - paginado y filtrable por texto
    // (mandar pagina/limite activa esa respuesta en el backend, ver asistencia.controller.ts), lo consume el
    // Directorio de Operadores del Panel de Asistente.
    obtenerOperadoresPaginado(pagina: number, limite: number, q?: string): Observable<RespuestaPaginada<Operador>> {
        let params = new HttpParams().set('pagina', pagina).set('limite', limite);
        if (q) params = params.set('q', q);
        return this.http.get<RespuestaPaginada<Operador>>(`${this.baseUrl}/operadores`, { params }).pipe(
            catchError(err => {
                console.warn('Error al obtener operadores paginados:', err);
                return of({ data: [], total: 0, pagina, totalPaginas: 1 });
            })
        );
    }

    // PUT -> https://.../api/asistencia/operadores/:id
    actualizarOperador(id: number, datos: Partial<Operador>): Observable<any> {
        return this.http.put(`${this.baseUrl}/operadores/${id}`, datos);
    }

    // DELETE -> /api/asistencia/operadores/:id - soft-delete: el operador desaparece del Directorio pero sus
    // Asistencias/RegistroActividad ya creados lo siguen mostrando con normalidad (ver eliminarOperador backend).
    eliminarOperador(id: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.baseUrl}/operadores/${id}`);
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

    // GET -> /api/actividad?pagina=1&limite=20&q=... - paginado y filtrable por texto (mandar pagina/limite
    // activa esa respuesta en el backend, ver actividades.controller.ts), lo consume el autocompletar de
    // Actividad del Panel de Actividades.
    obtenerActividadesPaginado(pagina: number, limite: number, q?: string): Observable<RespuestaPaginada<Actividad>> {
        const urlActividades = `${environment.apiUrl}/actividad`;
        let params = new HttpParams().set('pagina', pagina).set('limite', limite);
        if (q) params = params.set('q', q);
        return this.http.get<RespuestaPaginada<Actividad>>(urlActividades, { params }).pipe(
            catchError(err => {
                console.warn('Error al obtener actividades paginadas de /api/actividad: ', err);
                return of({ data: [], total: 0, pagina, totalPaginas: 1 });
            })
        );
    }

    // POST/PUT/DELETE -> /api/actividad - gestión del catálogo (pestaña "Actividad" del Panel de Asistente).
    // DELETE es soft-delete (paranoid, ver models/actividad.ts): la actividad desaparece de los listados pero
    // las marcaciones/labores ya registradas que la usaron la siguen mostrando con normalidad.
    crearActividad(datos: { codigo_megued: string; description: string; categoria?: 'TALLER' | 'CAMPO' }): Observable<Actividad> {
        return this.http.post<Actividad>(`${environment.apiUrl}/actividad/nueva`, datos);
    }

    actualizarActividad(id: number, datos: { codigo_megued: string; description: string; categoria?: 'TALLER' | 'CAMPO' }): Observable<{ message: string; existente: Actividad }> {
        return this.http.put<{ message: string; existente: Actividad }>(`${environment.apiUrl}/actividad/${id}`, datos);
    }

    eliminarActividad(id: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${environment.apiUrl}/actividad/${id}`);
    }

    // GET -> https://.../api/asistencia/hoy?fecha=YYYY-MM-DD&pagina=1&limite=30
    // Paginado: al Supervisor tampoco le llega de golpe todo el dia de una sola vez.
    // supervisorId opcional: lo usa el panel de ADMIN (ve TODAS las haciendas mezcladas aqui) para acotar a lo
    // que hizo un Supervisor puntual.
    obtenerAsistenciasHoy(
        fecha?: string,
        pagina: number = 1,
        limite: number = 30,
        supervisorId?: number
    ): Observable<{ data: Asistencia[]; total: number; pagina: number; totalPaginas: number; diaCerrado: boolean }> {
        let params = `?pagina=${pagina}&limite=${limite}`;
        if(fecha) params += `&fecha=${fecha}`;
        if(supervisorId) params += `&supervisor_id=${supervisorId}`;
        return this.http.get<{ data: Asistencia[]; total: number; pagina: number; totalPaginas: number; diaCerrado: boolean }>(
            `${this.baseUrl}/hoy${params}`
        );
    }

    //GET -> /api/asistencia/historial?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    // operadorId opcional: lo usa el modal "Historial de Asistencia" de la Ficha (Directorio de Operadores) para
    // traer solo las jornadas de ESE operador, reutilizando el mismo endpoint/filtro que ya soporta el backend.
    // supervisorId opcional: filtra solo lo que hizo ese Supervisor (via operador.supervisor_id), lo usa el
    // Historial cuando lo ve un ADMIN.
    obtenerHistorial(fechaInicio?: string, fechaFin?: string, pagina:number=1, limite:number=30, haciendaId?: number, operadorId?: number, supervisorId?: number
    ): Observable<{data:Asistencia[]; total:number; pagina:number; totalPaginas:number}>{
        let params = new HttpParams().set('pagina', pagina).set('limite', limite);
        if(fechaInicio) params = params.set('fecha_inicio', fechaInicio);
        if(fechaFin) params = params.set('fecha_fin', fechaFin);
        if(haciendaId) params = params.set('hacienda_id', haciendaId);
        if(operadorId) params = params.set('operador_id', operadorId);
        if(supervisorId) params = params.set('supervisor_id', supervisorId);

        return this.http.get<{data:Asistencia[]; total:number; pagina:number; totalPaginas:number}>(
            `${this.baseUrl}/historial`, { params });
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