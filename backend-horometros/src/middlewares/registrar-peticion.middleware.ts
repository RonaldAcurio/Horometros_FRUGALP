import { Request, Response, NextFunction } from 'express';
import { RegistroPeticion } from '../models/registro_peticion';

/*
Historial de TODAS las peticiones HTTP (pedido del usuario, 2026-10-05, tras un incidente donde unos
trabajadores no pudieron entrar y no quedo NINGUN rastro de quien fue ni por que - ver CLAUDE.md). Se monta UNA
sola vez, bien arriba en app.ts, antes de las rutas - asi cubre cada peticion sin que cada controller tenga que
acordarse de llamarlo (la misma razon de fondo por la que 'verificarAutenticacion'/'requireRol' son middlewares
de ruta y no codigo copiado dentro de cada controller).

Se engancha a 'finish' (no loggea antes de que la respuesta ya se envio) y lee req.auth en ESE momento - para
entonces, si la ruta tiene 'verificarAutenticacion', esa ya corrio y dejo el rol/actor puestos; si la peticion
es publica (kiosco) o fue rechazada antes de autenticar a nadie, actor_* queda NULL a proposito (no es un dato
faltante, es la respuesta real: "nadie identificado").

Igual que registrarAuditoria (utils/registrar-auditoria.ts): un fallo ACA nunca tumba la respuesta real, que ya
se le envio al cliente - solo se los deja en el log del servidor.
*/

/*
RUTAS_DE_ALTO_VOLUMEN (pedido del usuario, 2026-10-05, tras calcular que esto solo podia llegar a ~11GB/año):
mi-jornada.ts sondea 'mi-estado' cada 5s MIENTRAS el trabajador tenga la pantalla abierta (iniciarPollingEstado)
y 'mi-qr' cada 80s en el camino QR - juntas son >99% del volumen total de peticiones, pero no aportan nada para
investigar un incidente real (no son una accion de nadie, son el "¿seguis ahi?" automatico del celular). Se
siguen viendo en la consola (linea de abajo, 'console.log' corre SIEMPRE) para quien este mirando los logs de
Railway en vivo - lo unico que se salta es el INSERT a la base de datos.
*/
const RUTAS_DE_ALTO_VOLUMEN = new Set(['/api/asistencia/mi-estado', '/api/asistencia/mi-qr']);

export const registrarPeticion = (req: Request, res: Response, next: NextFunction): void => {
    const inicio = Date.now();
    /*
    req.originalUrl, NUNCA req.path/req.url: Express reescribe req.path/req.url al entrar a cada sub-router
    montado (app.use('/api/asistencia', asistenciaRoutes), etc.) y esa reescritura NO se deshace despues - para
    cuando corre 'finish', req.path ya solo tiene el tramo final ('/login', '/marcar-qr'), sin el prefijo
    ('/api/auth', '/api/asistencia'). req.originalUrl es la unica que Express garantiza intacta durante toda la
    vida de la peticion. Se captura ACA (antes de que el resto del chain la toque), no adentro del callback.
    */
    const ruta = req.originalUrl.split('?')[0] ?? req.originalUrl;

    res.on('finish', () => {
        const duracionMs = Date.now() - inicio;
        const actorTipo = req.auth?.tipo ?? null;
        const actorRol = req.auth?.rol ?? null;
        const actorId = req.auth?.id ?? null;

        console.log(
            `[peticion] ${req.method} ${ruta} -> ${res.statusCode} (${duracionMs}ms) `
            + `actor=${actorTipo ?? 'anonimo'}${actorRol ? `/${actorRol}` : ''}${actorId ? ` #${actorId}` : ''}`
        );

        if (RUTAS_DE_ALTO_VOLUMEN.has(ruta)) return;

        RegistroPeticion.create({
            metodo: req.method,
            ruta,
            status_code: res.statusCode,
            duracion_ms: duracionMs,
            actor_tipo: actorTipo,
            actor_rol: actorRol,
            actor_id: actorId,
        }).catch((err) => {
            console.error('Error al registrar la peticion en el historial (la respuesta ya se envio, esto no la afecta):', err);
        });
    });

    next();
};
