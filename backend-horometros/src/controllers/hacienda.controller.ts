import { Request, Response } from "express";
import crypto from 'crypto';
import { Op } from 'sequelize';
import { Hacienda } from "../models/hacienda";
import { TokenHacienda } from "../models/token_hacienda";
import { registrarAuditoria } from "../utils/registrar-auditoria";
import { obtenerFechaLocalEcuador } from "../utils/fecha-ecuador";

//24h: vigencia del Token de Hacienda(distinto del JWT de sesion)
const TOKEN_VIGENCIA_MS = 24*60*60*1000;

/*
Lista de haciendas: la usa el Frontend para los selectores (asignar hacienda a un Usuario ESCANER/SUPERVISOR
nuevo, elegir para cual generar el Token) y para que el Supervisor vea el estado de SU PROPIO token (ver
"miHacienda" en supervisor-panel.ts - busca su hacienda dentro de esta misma lista). Requiere JWT con rol
ADMIN, SUPERVISOR o ASISTENTE (ver la ruta).
*/
export const obtenerHaciendas = async(req:Request, res:Response):Promise<void> => {
    try{
        const haciendas = await Hacienda.findAll({ order: [['nombre', 'ASC']] });

        /*
        token_actual/token_expira_en son un dato sensible - el Token de Hacienda es una credencial real que
        permite marcar presencia sin QR (Camino A). Antes este endpoint devolvia esos 2 campos para TODAS las
        haciendas sin importar quien preguntara, aunque el frontend solo mostrara la propia (bug real, mismo
        patron que el resto de esta auditoria - restriccion solo de frontend, nada del lado del backend). Un
        SUPERVISOR ve el token completo SOLO de su propia hacienda (lo necesita para su panel); ASISTENTE no
        necesita ver ningun token (solo usa esta lista como selector de nombre/id al crear Usuarios). ADMIN
        sigue viendo todo, administra cualquier hacienda.
        */
        const esAdmin = req.auth?.tipo === 'usuario' && req.auth.rol === 'ADMIN';
        const propiaHaciendaId = req.auth?.tipo === 'usuario' && req.auth.rol === 'SUPERVISOR' ? req.auth.hacienda_id : null;

        /*
        FASE B (ver MEMORY.md): token_actual/token_expira_en de la respuesta ya NO salen de Hacienda (Fase A
        sigue escribiendo ahi, pero deja de ser lo que se LEE) - se reemplazan por la fila de esa fecha en
        tokens_hacienda, coherente con que una ENTRADA nueva solo acepta el codigo de hoy. Una sola consulta
        para todas las haciendas, en vez de una por hacienda.

        PENDIENTE 1 (calendario de tokens, ver MEMORY.md): admite un ?fecha= opcional en la query para que el
        Supervisor pueda consultar el estado del token de un dia DISTINTO a hoy (ej. navego el calendario al
        sabado - quiere ver si ya tiene token generado para ese dia, no el de hoy). Sin 'fecha', se comporta
        exactamente como antes (el token de hoy).
        */
        const fechaConsulta = typeof req.query.fecha === 'string' && req.query.fecha
            ? req.query.fecha
            : obtenerFechaLocalEcuador();
        const tokensDeFecha = await TokenHacienda.findAll({
            where: { fecha: fechaConsulta, activo: true, expira_en: { [Op.gt]: new Date() } },
        });
        const tokenPorHacienda = new Map(tokensDeFecha.map((t) => [t.hacienda_id, t]));

        const resultado = haciendas.map((h) => {
            if(!esAdmin && h.id !== propiaHaciendaId){
                const { token_actual, token_expira_en, ...resto } = h.toJSON();
                return resto;
            }
            const tokenDeFecha = tokenPorHacienda.get(h.id);
            return {
                ...h.toJSON(),
                token_actual: tokenDeFecha?.token ?? null,
                token_expira_en: tokenDeFecha?.expira_en ?? null,
            };
        });

        res.json(resultado);
    }catch(err){
        console.error('Error al obtener las haciendas.', err);
        res.status(500).json({ message: 'Error al obtener las haciendas.' });
    }
};

/*
Crea una hacienda nueva. Solo ADMIN (ver la ruta) - a diferencia de generar/invalidar Token, un Supervisor no
crea haciendas (el solo administra la suya, que ya existe antes de que el exista como cuenta).
*/
export const crearHacienda = async(req:Request, res:Response):Promise<void> => {
    try{
        const { nombre } = req.body;
        if(!nombre || !nombre.trim()){
            res.status(400).json({ message: 'El nombre de la hacienda es obligatorio.'});
            return;
        }

        const existente = await Hacienda.findOne({ where: { nombre: nombre.trim() }});
        if(existente){
            res.status(409).json({ message: 'Ya existe una hacienda con ese nombre.'});
            return;
        }

        const hacienda = await Hacienda.create({ nombre: nombre.trim() });
        res.status(201).json(hacienda);
    }catch(err){
        console.error('Error al crear la hacienda.', err);
        res.status(500).json({ message: 'Error al crear la hacienda.' });
    }
};

// Medianoche en Ecuador (UTC-5, sin horario de verano) del dia 'fecha' (YYYY-MM-DD), como Date real.
const medianocheEcuador = (fecha: string): Date => new Date(`${fecha}T05:00:00.000Z`);

/*
Gerena/regenera ek Token de Hacienda. Solo el Supervisor de esa Hacienda puede hacerlo (o un Admin, que puede tocar cualquiera).
No es un JWT:es una cadena aleatoria que se guarda en la BD porque cada escaneo QR la tiene que poder consultar.

FASE B (ver MEMORY.md, pedido real del usuario): admite un body.dias opcional (1 a 3) para dejar generados de
una vez los codigos de varios dias seguidos - pensado para el Supervisor que el viernes quiere dejar listo
sabado+domingo+lunes, ya que el no trabaja fin de semana pero sus trabajadores si. Cada dia pre-generado NO
sirve hasta que llegue su fecha (ver el chequeo en procesarMarcacion, Paso 3) - los dias futuros reciben 48h de
vigencia contadas desde su propia medianoche Ecuador (cubre el dia completo mas un turno nocturno hacia el
dia siguiente), en vez de depender de cuando se genero.

PENDIENTE 1 (calendario de tokens, ver MEMORY.md): tambien admite un body.fecha opcional (YYYY-MM-DD) para
generar el codigo de UN dia puntual (no necesariamente corrido desde hoy) - el Supervisor Panel ya tiene un
selector de fecha para navegar el Historial del dia (fechaSeleccionada); este mismo selector ahora tambien
decide para que dia se genera el token. Si viene 'fecha', 'dias' se ignora (un solo dia a la vez).
*/
export const generarTokenHacienda = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const haciendaId = Number(id);
        const fechaExplicita = typeof req.body?.fecha === 'string' && req.body.fecha ? req.body.fecha : null;
        const diasSolicitados = fechaExplicita ? 1 : Math.min(3, Math.max(1, Number(req.body?.dias) || 1));

        if(req.auth?.rol === 'SUPERVISOR' && req.auth.hacienda_id !== haciendaId){
            res.status(403).json({ message:'No puedes generar el token de una hacienda que no es la tuya.'});
            return;
        }

        const hacienda =await Hacienda.findByPk(haciendaId);
        if(!hacienda){
            res.status(404).json({message:'Hacienda no encontrada.'});
            return;
        }

        const hoy = obtenerFechaLocalEcuador();

        /*
        FASE A (doble escritura) + FASE B (dias futuros/puntuales, recien utiles porque las lecturas ya
        respetan la fecha): un UPSERT por cada dia solicitado. Regenerar el mismo dia sigue actualizando esa
        misma fila (UNIQUE hacienda_id+fecha), nunca crea una fila de sobra. Los campos viejos de Hacienda
        (token_actual/token_expira_en) SOLO representaron "el token de HOY" - se tocan unicamente si alguno de
        los dias generados es hoy (si el Supervisor genero un dia futuro puntual, no se tocan).
        */
        const generados: { fecha: string; token: string; expira_en: Date }[] = [];
        let tokenDeHoy: { token: string; expira_en: Date } | null = null;
        for(let i = 0; i < diasSolicitados; i++){
            const fechaDia = fechaExplicita ?? obtenerFechaLocalEcuador(new Date(Date.now() + i * 24 * 60 * 60 * 1000));
            const esHoy = fechaDia === hoy;
            const tokenDia = crypto.randomBytes(20).toString('hex');
            const expiraEnDia = esHoy
                ? new Date(Date.now() + TOKEN_VIGENCIA_MS)
                : new Date(medianocheEcuador(fechaDia).getTime() + 48 * 60 * 60 * 1000);
            await TokenHacienda.upsert({
                hacienda_id: hacienda.id,
                fecha: fechaDia,
                token: tokenDia,
                expira_en: expiraEnDia,
                activo: true,
                generado_por_usuario_id: req.auth!.id,
            });
            generados.push({ fecha: fechaDia, token: tokenDia, expira_en: expiraEnDia });
            if(esHoy) tokenDeHoy = { token: tokenDia, expira_en: expiraEnDia };
        }

        if(tokenDeHoy){
            await hacienda.update({
                token_actual: tokenDeHoy.token,
                token_expira_en: tokenDeHoy.expira_en,
            });
        }

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'GENERAR_TOKEN_HACIENDA',
            objetivoTipo: 'hacienda',
            objetivoId: hacienda.id,
            objetivoNombre: fechaExplicita
                ? `${hacienda.nombre} (${fechaExplicita})`
                : diasSolicitados > 1 ? `${hacienda.nombre} (${diasSolicitados} dias)` : hacienda.nombre,
        });

        res.json({
            message: fechaExplicita
                ? `Token de hacienda generado para el ${fechaExplicita}.`
                : diasSolicitados > 1
                ? `Token de hacienda generado para los próximos ${diasSolicitados} días.`
                : 'Token de hacienda generado correctamente',
            token_actual: tokenDeHoy?.token ?? hacienda.token_actual,
            token_expira_en: tokenDeHoy?.expira_en ?? hacienda.token_expira_en,
            // Nuevo, informativo - el frontend de hoy lo ignora sin romperse (sigue leyendo solo los 2 de arriba).
            tokens_generados: generados,
        });

    }catch(err){
        console.error('Error al generar el token de la hacienda', err);
        res.status(500).json({ message: 'Error al generar el token de la hacienda' });

    }
};

/*
Invalida el token de Hacienda antes de su vencimiento natural (misma regla de permisos que generar).

FASE B (ver MEMORY.md): admite un body.fecha opcional (YYYY-MM-DD) para invalidar UN dia especifico entre los
pre-generados (ver generarTokenHacienda, "dias") - por ejemplo, si el codigo del domingo se filtro, se puede
apagar solo ese sin tocar el de hoy ni el de manana. Sin 'fecha', se comporta exactamente como antes
(invalida el de HOY). Los campos viejos de Hacienda (token_actual/token_expira_en) SOLO se tocan cuando la
fecha a invalidar es HOY - esos campos unicos siempre representaron "el token de hoy", nunca tuvieron forma de
guardar un dia futuro, asi que invalidar un dia futuro no debe pisarlos.
*/
export const invalidarToken = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const haciendaId = Number(id);
        const fechaAInvalidar = typeof req.body?.fecha === 'string' && req.body.fecha
            ? req.body.fecha
            : obtenerFechaLocalEcuador();

        if(req.auth?.rol === 'SUPERVISOR' && req.auth.hacienda_id !== haciendaId){
            res.status(403).json({
                message: 'No puedes invalidar el token de una hacienda que no es tuya.'
            });
            return;
        }

        const hacienda= await Hacienda.findByPk(haciendaId);
        if(!hacienda){
            res.status(404).json({ message:'Hacienda no encontrada.'});
            return;
        }

        if(fechaAInvalidar === obtenerFechaLocalEcuador()){
            await hacienda.update({
                token_actual:null,
                token_expira_en:null,
            });
        }

        // No crea una fila nueva si no habia ninguna para esa fecha (no tiene sentido "invalidar" algo que
        // nunca se genero).
        await TokenHacienda.update(
            { activo: false },
            { where: { hacienda_id: haciendaId, fecha: fechaAInvalidar } }
        );

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'INVALIDAR_TOKEN_HACIENDA',
            objetivoTipo: 'hacienda',
            objetivoId: hacienda.id,
            objetivoNombre: hacienda.nombre,
        });

        res.json({ message:'Token de hacienda invalidado correctamente.'});

    }catch(err){
        console.error('Error al invalidar el token de hacienda.', err);
        res.status(500).json({ message: 'Error al invalidar el token de hacienda.' });

    }
};