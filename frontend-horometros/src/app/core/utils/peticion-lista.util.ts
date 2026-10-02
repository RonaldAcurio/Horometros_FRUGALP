import { timeout } from 'rxjs';

/*
Pedido real del usuario (2026-10-02): con internet inestable (o el servidor lento), las listas del Panel de
Asistente/Supervisor (Operadores, Equipos, Actividades, Historial, Observaciones...) se quedaban en blanco sin
avisar nada - ni un "Cargando...", ni un límite de tiempo, así que una petición que tardaba mucho (o se
quedaba colgada del todo, sin timeout de HttpClient) daba la sensación de que la app estaba trabada. Esto da un
límite razonable y un mensaje claro cuando se cumple, para usar junto con un flag `cargando` en cada lista (ver
asistencia-panel.ts/supervisor-panel.ts).
*/
export const TIMEOUT_LISTA_MS = 20000;

// Pipeable operator: agregar con .pipe(timeoutDeLista()) a cualquier Observable de una lista.
export const timeoutDeLista = <T>() => timeout<T>(TIMEOUT_LISTA_MS);

// Mensaje a mostrar en el 'error' del subscribe - distingue el timeout de arriba (nombre fijo 'TimeoutError'
// que pone RxJS) de un error real del backend, que sigue mostrando su propio mensaje.
export function mensajeErrorCarga(err: any, generico: string): string {
    if (err?.name === 'TimeoutError') {
        return 'La conexión está muy lenta y la petición tardó demasiado. Revisa tu internet e intenta de nuevo.';
    }
    return err?.error?.message || generico;
}
