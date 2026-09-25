import { Request, Response } from 'express';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Actividad } from '../models';
import { Op, literal } from 'sequelize';
import { AsistenciaActividad, RegistroActividad } from '../models';
import { Usuario } from '../models/usuario';
import { Hacienda } from '../models/hacienda';
import bcrypt from 'bcryptjs';
import { generarTokenQrJornada, verificarTokenQrJornada } from '../services/jwt.service';
import { tokenHaciendaVigente } from '../utils/token-hacienda';
import { registrarAuditoria } from '../utils/registrar-auditoria';
import { cifrarDeterministico } from '../utils/cifrado';

/*
Columnas que excluimos de los LISTADOS (hoy/historial): la foto pesa decenas/cientos de KB en Base64, y si el supervisor tiene
70 registros en pantalla no tiene sentido bajarlas todas de una. 
En su lugar mandamos "tiene_fot" (un booleano liviano) y la foto real se pide aparte, solo cuando el usuario hace clic en "ver-Evidencia"
(ver obtenerFotoAsistencia).
*/
const ATRIBUTOS_SIN_FOTO = {
    exclude: ['foto_ingreso'],
    include: [[literal('"foto_ingreso" IS NOT NULL'), 'tiene_foto']] as any,
};

//funcion auxiliar para obtener la decha 'YYYY-MM-DD' en la zona horario de Ecuador
const getFetchLocalEcuador = ():string => {
    return new Date().toLocaleDateString('sv-SE',{timeZone: 'America/Guayaquil'});
};

const ROLES_OPERADOR_VALIDOS = ['MECANICO', 'OPERADOR'];

/*
Chequeo PREVIO de codigo_megued/cedula duplicados, antes de intentar el INSERT/UPDATE: sin esto, el choque contra
el UNIQUE de la BD tumbaba con un 500 generico y sin informacion (el usuario solo veia "Error al crear el operador",
sin saber cual campo chocaba ni con quien). 'idAExcluir' es el propio id al EDITAR, para no chocar contra si mismo.
Devuelve un mensaje listo para mostrar (con el nombre de quien ya tiene ese dato), o null si no hay conflicto.
*/
const verificarDuplicadosOperador = async(
    datos: { codigo_megued?: string; cedula?: string | null },
    idAExcluir?: number
): Promise<string | null> => {
    if(datos.codigo_megued){
        const where: any = { codigo_megued: datos.codigo_megued };
        if(idAExcluir) where.id = { [Op.ne]: idAExcluir };
        const existente = await Operador.findOne({ where });
        if(existente){
            return `El código MEGUED "${datos.codigo_megued}" ya está registrado a nombre de ${existente.nombre_completo}.`;
        }
    }
    if(datos.cedula){
        /*
        cedula se guarda CIFRADA de forma deterministica (ver models/operador.ts) - el 'where' de Sequelize NO
        pasa por el set() del modelo (eso solo aplica a instance.cedula = x / .create()/.update()), asi que hay
        que cifrar el valor buscado ACA, a mano, de la misma forma, para poder comparar contra lo que ya esta
        en la BD. Sin esto, esta busqueda nunca encontraria coincidencias (comparando texto plano contra
        cifrado) y dejaria pasar cedulas duplicadas silenciosamente.
        */
        const where: any = { cedula: cifrarDeterministico(datos.cedula) };
        if(idAExcluir) where.id = { [Op.ne]: idAExcluir };
        const existente = await Operador.findOne({ where });
        if(existente){
            return `La cédula "${datos.cedula}" ya está registrada a nombre de ${existente.nombre_completo}.`;
        }
    }
    return null;
};

/*
Valida el trio opcional supervisor_id/usuario/clave que puede venir al crear o actualizar un Operador.
Devuelve null (y ya respondio el error) si algo no es valido, o el objeto listo para mezclar en Operador.create/update.
usuario y clave van SIEMPRE juntos: no tiene sentido mandar uno sin el otro. 'idAExcluir' es el propio id al EDITAR,
para no rechazar el usuario que el operador YA tenia asignado.
*/
const validarCredencialesOperador = async(
    req: Request, res: Response, idAExcluir?: number
): Promise<{ supervisor_id: number | null; usuario: string | null; clave_hash: string | null } | null> => {
    const { supervisor_id, usuario, clave } = req.body;

    let supervisorIdFinal: number | null = null;
    if(supervisor_id){
        const supervisor = await Usuario.findByPk(Number(supervisor_id));
        if(!supervisor || supervisor.cargo !== 'SUPERVISOR'){
            res.status(404).json({ message: 'El supervisor indicado no existe o no tiene el cargo SUPERVISOR.'});
            return null;
        }
        supervisorIdFinal = supervisor.id;
    }

    let usuarioFinal: string | null = null;
    let claveHashFinal: string | null = null;
    if(usuario || clave){
        if(!usuario || !clave){
            res.status(400).json({ message: 'usuario y clave van juntos: si envias uno, tienes que enviar el otro.'});
            return null;
        }
        if(clave.length < 8){
            res.status(400).json({ message: 'La clave debe tener al menos 8 caracteres.'});
            return null;
        }
        const usuarioExistente = await Usuario.findOne({ where: { usuario }});
        const operadorConMismoUsuario = await Operador.findOne({
            where: idAExcluir ? { usuario, id: { [Op.ne]: idAExcluir } } : { usuario },
        });
        if(usuarioExistente || operadorConMismoUsuario){
            const nombreExistente = usuarioExistente?.nombre_completo ?? operadorConMismoUsuario?.nombre_completo;
            res.status(409).json({ message: `El usuario "${usuario}" ya está en uso por ${nombreExistente}.`});
            return null;
        }
        usuarioFinal = usuario;
        claveHashFinal = await bcrypt.hash(clave, 10);
    }

    return { supervisor_id: supervisorIdFinal, usuario: usuarioFinal, clave_hash: claveHashFinal };
};

//Traduce un choque de UNIQUE que se nos haya escapado del chequeo previo (condicion de carrera) a un 409 legible,
//en vez de exponer el error crudo de la BD (con SQL y parametros) al cliente.
const mensajeDuplicadoGenerico = (err: any): string | null => {
    if(err?.name !== 'SequelizeUniqueConstraintError') return null;
    const campo = err.errors?.[0]?.path;
    const valor = err.errors?.[0]?.value;
    if(campo === 'codigo_megued') return `El código MEGUED "${valor}" ya está en uso.`;
    // Sin el valor en el mensaje (a diferencia de codigo_megued/usuario, abajo): 'cedula' se guarda cifrada
    // (ver models/operador.ts), asi que 'valor' aca seria el texto cifrado, no la cedula real - mostrarlo
    // confundiria en vez de ayudar.
    if(campo === 'cedula') return 'Esa cédula ya está registrada a nombre de otro operador.';
    if(campo === 'usuario') return `El usuario "${valor}" ya está en uso.`;
    return 'Ese dato ya está en uso por otro registro.';
};

//Crear un Nuevo Operador
export const crearOperador = async (req:Request, res:Response):Promise<void> => {
    try{

        const { nombre_completo, codigo_megued, cedula, telefono, direccion, rol } = req.body;
        if(!nombre_completo || !codigo_megued){
            res.status(400).json({message:'El nombre completo y el codigo son obligatorios'});
            return;
        }
        if(rol && !ROLES_OPERADOR_VALIDOS.includes(rol)){
            res.status(400).json({message: `rol debe ser uno de: ${ROLES_OPERADOR_VALIDOS.join(', ')}.`});
            return;
        }

        const mensajeDuplicado = await verificarDuplicadosOperador({ codigo_megued, cedula: cedula || null });
        if(mensajeDuplicado){
            res.status(409).json({ message: mensajeDuplicado });
            return;
        }

        const credenciales = await validarCredencialesOperador(req, res);
        if(!credenciales) return; // ya se respondio el error adentro

        const nuevoOperador = await Operador.create({
            nombre_completo,
            codigo_megued,
            // '' -> null: 'cedula' tiene UNIQUE en la BD. NULL nunca choca contra otro NULL (Postgres los trata
            // como "desconocidos", nunca iguales entre si), pero '' si choca contra otro '' - sin esto, el
            // segundo Operador creado sin cedula tumbaba con un 500 (SequelizeUniqueConstraintError).
            cedula: cedula || null,
            telefono,
            direccion,
            // Sin 'rol' en el body, se queda con el default de la BD ('MECANICO').
            ...(rol ? { rol } : {}),
            supervisor_id: credenciales.supervisor_id,
            usuario: credenciales.usuario,
            clave_hash: credenciales.clave_hash,
        });

        const { clave_hash: _omitido, ...perfil } = nuevoOperador.toJSON() as any;
        res.status(201).json(perfil);
    }
    catch(err){
        const mensajeDuplicado = mensajeDuplicadoGenerico(err);
        if(mensajeDuplicado){
            res.status(409).json({ message: mensajeDuplicado });
            return;
        }
        console.error('Error al crear el operador:', err);
        res.status(500).json({message:'Error al crear el operador. Intenta de nuevo.'});
    }
}

//Actualizamos la Informacion personal del Operador
export const actualizarOperador = async (req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { cedula, telefono, direccion, rol } = req.body;

        if(rol && !ROLES_OPERADOR_VALIDOS.includes(rol)){
            res.status(400).json({message: `rol debe ser uno de: ${ROLES_OPERADOR_VALIDOS.join(', ')}.`});
            return;
        }

        const operador = await Operador.findByPk(Number(id));
        if(!operador){
            res.status(404).json({message: 'Operador no encontrado'});
            return;
        }

        const mensajeDuplicado = await verificarDuplicadosOperador({ cedula: cedula || null }, operador.id);
        if(mensajeDuplicado){
            res.status(409).json({ message: mensajeDuplicado });
            return;
        }

        const credenciales = await validarCredencialesOperador(req, res, operador.id);
        if(!credenciales) return;

        // Si esta edicion incluyo una clave nueva, invalida cualquier JWT de este Operador emitido antes de
        // ahora (mismo motivo que resetearClaveOperador) - si no cambio la clave, no toca la sesion vigente.
        const claveCambio = credenciales.clave_hash !== null;

        await operador.update({
            cedula: cedula || null, // ver nota en crearOperador: '' choca contra otro '' en el UNIQUE, null no.
            telefono,
            direccion,
            // ?? en vez de || : si no mandan un dato nuevo, conservamos el que ya tenia (no lo borramos).
            rol: rol ?? operador.rol,
            supervisor_id: credenciales.supervisor_id ?? operador.supervisor_id,
            usuario: credenciales.usuario ?? operador.usuario,
            clave_hash: credenciales.clave_hash ?? operador.clave_hash,
            sesion_valida_desde: claveCambio ? new Date() : operador.sesion_valida_desde,
        });

        if(claveCambio){
            await registrarAuditoria({
                actorUsuarioId: req.auth!.id,
                accion: 'CAMBIAR_CREDENCIALES_OPERADOR',
                objetivoTipo: 'operador',
                objetivoId: operador.id,
                objetivoNombre: operador.nombre_completo,
            });
        }

        const { clave_hash: _omitido, ...perfil } = operador.toJSON() as any;
        res.json({message:"Operador actualizado exitosamente", operador: perfil});
    }
    catch(err){
        const mensajeDuplicado = mensajeDuplicadoGenerico(err);
        if(mensajeDuplicado){
            res.status(409).json({ message: mensajeDuplicado });
            return;
        }
        console.error('Error al actualizar el operador:', err);
        res.status(500).json({message: 'Error al actualizar el operador. Intenta de nuevo.'});
    }
};

// Eliminar (soft-delete) un Operador - pone deletedAt, no borra la fila: sus Asistencias/RegistroActividad ya
// creados siguen mostrando su nombre normalmente (ver includes con paranoid:false mas abajo en este archivo).
export const eliminarOperador = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const operador = await Operador.findByPk(Number(id));
        if (!operador) {
            res.status(404).json({ message: 'Operador no encontrado.' });
            return;
        }

        await operador.destroy();
        res.status(200).json({ message: 'Operador eliminado exitosamente.' });
    } catch (err) {
        console.error('Error al eliminar el operador:', err);
        res.status(500).json({ message: 'Error al eliminar el operador.' });
    }
};

//Obtener la lista de operadores
export const obtenerOperadores = async(_req: Request, res:Response):Promise<void> => {
    try{
        const operadores = await Operador.findAll({
            attributes: { exclude: ['clave_hash'] },
            include: [{ model: Usuario, as: 'supervisor', attributes: { exclude: ['clave_hash'] } }],
            order: [['nombre_completo','ASC']],
        });
        res.json(operadores);
    } catch(err){
        res.status(500).json({message:'Error al obtener operdadores',err});
    }
};

/*
Contexto de "donde" ocurre la marcacion: solo tiene datos cuando alguien mas confirma la identidad del trabajador
(Camino A: codigo+Token de Hacienda, o Camino B: Supervisor/Escaner escaneando el QR de sesion). El carnet fisico
(registrarMacarcoQR) no pasa contexto: sigue siendo el flujo clasico, sin cambios.
*/
interface ContextoMarcacion {
    hacienda_prestamo_id?: number | null;
    admitido_por_usuario_id?: number | null;
    /*
    Camino B (QR de sesion): el trabajador YA registro el detalle de su jornada en el Panel de Actividades
    (RegistroActividad, uno por labor) mientras trabajaba - pedirle otra vez "que actividades hiciste" al
    momento de escanear la salida es redundante y una fila mas frente a quien lo escanea (Supervisor/Escaner).
    Cuando esto viene true, la salida no exige actividades_ids (puede llegar vacio sin rechazar el 400).
    */
    omitirActividadRequerida?: boolean;
}

/*
Nucleo de la logica de Entrada/Salida, compartido por los 3 caminos que hoy puede tomar una marcacion:
carnet fisico (registrarMacarcoQR), codigo+Token de Hacienda (marcarConCodigo) y QR de sesion (marcarConQrSesion).
Antes esta logica vivia duplicada solo en registrarMacarcoQR; sacarla de ahi evita que un cambio de regla de negocio
(p.ej. como se cierra un turno que cruza la medianoche) se tenga que repetir y probar 3 veces.
Devuelve {status, body} en vez de escribir directo en 'res': quien la llama decide como responder.
*/
const procesarMarcacion = async(
    operador: Operador,
    datos: { actividades_ids?: unknown; foto_ingreso?: string | null },
    contexto: ContextoMarcacion = {}
): Promise<{ status: number; body: any }> => {
    const ahora = new Date();

    /*
    Pasa 1= tienes una jornada ABIERTA(EN_JORNADA), sin importar la fecha en que empezo?
    ESto es lo que permite cerrar correctamente turnos que cruzan la medianoche (entra 10pm, sale 6am del dia sigueiente):
    la salida cierra ESA marca puntual, no depende de que la fecha calendario siga siendo la misma
    */
    let asistencia = await Asistencia.findOne({
        where:{
            operador_id: operador.id,
            estado: 'EN_JORNADA'
        },
    });

    if(asistencia){
        //Tiene una jornada abierta -> este escaneo es una SALIDA (exigimos actividad)
        const actividadesIds:number[] = Array.isArray(datos.actividades_ids)
            ? (datos.actividades_ids as unknown[]).map(Number)
            : [];

        if(actividadesIds.length === 0 && !contexto.omitirActividadRequerida){
            return {
                status: 400,
                body: {
                    message:"Es obligatorio seleccionar al menos una actividad para registrar la salida.",
                    require_actividad: true
                },
            };
        }

        // Validar que la actividad exista y NO este eliminada(Soft Delete) - solo si vino alguna que validar.
        if(actividadesIds.length > 0){
            const actividadExistente = await Actividad.findAll({where: { id: actividadesIds}});
            if(actividadExistente.length !== actividadesIds.length){
                return { status: 404, body: { message:'Una o mas actividades seleccionadas no existen o estan inactivas'} };
            }
        }

        await asistencia.update({ hora_salida:ahora, estado:'PENDIENTE_REVISION' });

        //Insertamos el detalle de actividades en la tabla pivote (relacion muchos a muchos)
        await AsistenciaActividad.bulkCreate(
            actividadesIds.map((actividad_id) => ({
                asistencia_id: asistencia!.id,
                actividad_id,
            }))
        );

        return {
            status: 200,
            body: {
                tipo: 'SALIDA',
                message:`Hasta Luego! Salida registrada a las ${ahora.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil' })}`,
                operador: operador.nombre_completo,
                asistencia,
            },
        };
    }

    /*
    Paso 2: no tiene ninguna jornada abierta. Antes de crear una ENTRADA nueva, verificamos si HOY (fecha calendario)
    ya completo un turno completo, para mantener la regla de "una jornada por dia" (evita reingresos multiples el mismo dia).
    */
    const hoy = getFetchLocalEcuador();
    const asistenciaHoy = await Asistencia.findOne({
        where: {operador_id: operador.id, fecha: hoy},
    });
    if(asistenciaHoy){
        return {
            status: 400,
            body: { message: `El operador ${operador.nombre_completo} ya completo su jornada laboral de hoy.` },
        };
    }

    //Paso 3: Entrada Nueva
    asistencia = await Asistencia.create({
        operador_id: operador.id,
        fecha: hoy,
        hora_ingreso: ahora,
        estado: 'EN_JORNADA',
        foto_ingreso: datos.foto_ingreso || null,
        hacienda_prestamo_id: contexto.hacienda_prestamo_id ?? null,
        admitido_por_usuario_id: contexto.admitido_por_usuario_id ?? null,
    });

    return {
        status: 200,
        body: {
            tipo:'ENTRADA',
            message: `Bienvenido! Entrada registrada a las ${ahora.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil' })}`,
            operador: operador.nombre_completo,
            asistencia,
        },
    };
};

/*
Resuelve la hacienda "de casa" de un Operador: la de su Supervisor permanente (el Operador no tiene hacienda_id propio).
*/
const resolverHaciendaPropia = async(operador: Operador): Promise<number | null> => {
    if(!operador.supervisor_id) return null;
    const supervisor = await Usuario.findByPk(operador.supervisor_id);
    return supervisor?.hacienda_id ?? null;
};

//Logica de Marcacion con Escaner QR (Entrada/Salida) - carnet fisico del kiosco, sin cambios de comportamiento.
export const registrarMacarcoQR= async(req:Request, res:Response):Promise<void> => {
    try{
        const { operador_id, actividades_ids, foto_ingreso } = req.body;

        const operador = await Operador.findByPk(Number(operador_id));
        if(!operador){
            res.status(404).json({message:"Operador no registrado en el sistema"});
            return;
        }

        const { status, body } = await procesarMarcacion(operador, { actividades_ids, foto_ingreso });
        res.status(status).json(body);
    } catch(err){
        res.status(500).json({message:'Error procesando marca QR',err});
    }
};

/*
Camino A: haciendas sin camara/QR marcan con USUARIO+CLAVE del propio trabajador + Token de Hacienda del punto de
control (prueba que esta fisicamente ahi: el token cambia cada 24h y lo genera el Supervisor/Admin, ver hacienda.controller.ts).
No emite JWT de sesion: es una accion de una sola vez, igual que escanear el carnet, solo que autenticada por
credenciales en vez de confiar ciegamente en un QR fisico que se puede fotocopiar.
Si el trabajador esta marcando en una hacienda que NO es la suya, esto reemplaza al paso manual de "admitir externo":
como el token ya probo que esta fisicamente ahi, se autoadmite bajo el Supervisor de esa hacienda.
*/
export const marcarConCodigo = async(req:Request, res:Response):Promise<void> => {
    try{
        const { usuario, clave, token_hacienda, actividades_ids, foto_ingreso } = req.body;
        if(!usuario || !clave || !token_hacienda){
            res.status(400).json({ message: 'usuario, clave y token_hacienda son obligatorios.'});
            return;
        }

        const hacienda = await Hacienda.findOne({ where: { token_actual: token_hacienda }});
        if(!hacienda || !tokenHaciendaVigente(hacienda)){
            res.status(401).json({ message: 'El codigo de la hacienda es invalido o ya expiro.'});
            return;
        }

        const operador = await Operador.findOne({ where: { usuario }});
        if(!operador || !operador.clave_hash){
            res.status(401).json({ message: 'Usuario o clave incorrectos.'});
            return;
        }
        const claveValida = await bcrypt.compare(clave, operador.clave_hash);
        if(!claveValida){
            res.status(401).json({ message: 'Usuario o clave incorrectos.'});
            return;
        }

        const haciendaPropia = await resolverHaciendaPropia(operador);
        const esPrestamo = haciendaPropia !== null && haciendaPropia !== hacienda.id;

        let contexto: ContextoMarcacion = {};
        if(esPrestamo){
            const supervisorDeAlla = await Usuario.findOne({ where: { hacienda_id: hacienda.id, cargo: 'SUPERVISOR' }});
            contexto = {
                hacienda_prestamo_id: hacienda.id,
                admitido_por_usuario_id: supervisorDeAlla?.id ?? null,
            };
        }

        const { status, body } = await procesarMarcacion(operador, { actividades_ids, foto_ingreso }, contexto);
        res.status(status).json(body);
    }catch(err){
        res.status(500).json({ message: 'Error procesando la marcacion con codigo.', err});
    }
};

/*
Camino A para un trabajador YA logueado (distinto de marcarConCodigo, que es publico y re-verifica usuario+clave
desde cero para el kiosco SIN sesion): aca el trabajador entro por el login normal (usuario+clave, una sola vez) y
ya tiene su JWT - en la pantalla de "mi jornada" solo debe confirmar el codigo de su hacienda, sin volver a escribir
su clave. Requiere JWT de tipo 'operador' con jornada activa (ver verificarJornadaOperadorActiva en la ruta).
*/
export const marcarConMiCodigo = async(req:Request, res:Response):Promise<void> => {
    try{
        if(!req.auth || req.auth.tipo !== 'operador'){
            res.status(403).json({ message: 'Solo un Operador/Mecanico puede marcar con su codigo.'});
            return;
        }
        const { token_hacienda, actividades_ids, foto_ingreso } = req.body;
        if(!token_hacienda){
            res.status(400).json({ message: 'token_hacienda es obligatorio.'});
            return;
        }
        if(!req.auth.hacienda_id){
            res.status(400).json({ message: 'Tu cuenta todavia no tiene una hacienda asignada.'});
            return;
        }

        const hacienda = await Hacienda.findByPk(req.auth.hacienda_id);
        if(!hacienda || hacienda.token_actual !== token_hacienda || !tokenHaciendaVigente(hacienda)){
            res.status(401).json({ message: 'El codigo ingresado es invalido o ya expiro.'});
            return;
        }

        const operador = await Operador.findByPk(req.auth.id);
        if(!operador){
            res.status(404).json({ message: 'Operador no encontrado.'});
            return;
        }

        const { status, body } = await procesarMarcacion(operador, { actividades_ids, foto_ingreso });
        res.status(status).json(body);
    }catch(err){
        res.status(500).json({ message: 'Error procesando la marcacion con codigo.', err});
    }
};

/*
Autoservicio: el trabajador, desde su propio celular, marca su jornada abierta como SALIDA_OLVIDADA cuando no va a
poder volver a un punto de escaneo ni reingresar el codigo (p.ej. sale muy tarde y ya se fue a su casa). Antes esto
SOLO lo hacia el Supervisor en bloque al cerrar el dia (finalizarDia) - el trabajador no tenia como cerrarla el
mismo, y se quedaba con la jornada abierta indefinidamente hasta que el Supervisor la barriera. hora_salida es
opcional (el trabajador puede decir mas o menos a que hora se fue, igual que en el Panel de Actividades) - si no la
manda, se usa el momento del clic. Requiere JWT de tipo 'operador' con jornada activa.
*/
export const marcarSalidaOlvidada = async(req:Request, res:Response):Promise<void> => {
    try{
        if(!req.auth || req.auth.tipo !== 'operador'){
            res.status(403).json({ message: 'Solo un Operador/Mecanico puede marcar su propia salida.'});
            return;
        }

        const asistencia = await Asistencia.findOne({
            where: { operador_id: req.auth.id, estado: 'EN_JORNADA' },
        });
        if(!asistencia){
            res.status(404).json({ message: 'No tienes ninguna jornada abierta hoy.'});
            return;
        }

        const { hora_salida } = req.body;
        let horaSalidaFinal = new Date();
        if(hora_salida){
            const parseada = new Date(hora_salida);
            if(isNaN(parseada.getTime())){
                res.status(400).json({ message: 'hora_salida no es una fecha valida.'});
                return;
            }
            horaSalidaFinal = parseada;
        }

        await asistencia.update({ estado: 'SALIDA_OLVIDADA', hora_salida: horaSalidaFinal });

        res.json({ message: 'Tu salida quedó marcada. Tu supervisor la revisará.', asistencia });
    }catch(err){
        res.status(500).json({ message: 'Error al marcar tu salida.', err});
    }
};

/*
Camino B, paso 1: el trabajador YA esta logueado (tiene su JWT de sesion) y pide su QR flotante de jornada para que
alguien mas (Supervisor o Escaner) lo escanee. Requiere JWT de tipo 'operador' con jornada activa (ver
verificarJornadaOperadorActiva en la ruta).
*/
export const generarMiQr = async(req:Request, res:Response):Promise<void> => {
    try{
        if(!req.auth || req.auth.tipo !== 'operador'){
            res.status(403).json({ message: 'Solo un Operador/Mecanico puede generar su QR de jornada.'});
            return;
        }
        const qr_token = generarTokenQrJornada(req.auth.id);
        res.json({ qr_token, vigencia_segundos: 90 });
    }catch(err){
        res.status(500).json({ message: 'Error al generar el QR de jornada.', err});
    }
};

/*
El propio Operador consulta si YA tiene una jornada abierta hoy (EN_JORNADA). La pantalla del QR flotante hace
polling de esto para saber cuando dejar de mostrar el QR y pasar al Panel de Actividades - sin esto, el trabajador
no tendria forma de saber que ya lo escanearon sin refrescar la pagina a mano. Requiere JWT de tipo 'operador'.
*/
export const obtenerMiEstado = async(req:Request, res:Response):Promise<void> => {
    try{
        if(!req.auth || req.auth.tipo !== 'operador'){
            res.status(403).json({ message: 'Solo un Operador/Mecanico puede consultar su propio estado.'});
            return;
        }
        const hoy = getFetchLocalEcuador();
        const asistenciaHoy = await Asistencia.findOne({
            where: { operador_id: req.auth.id, fecha: hoy },
            attributes: ['id', 'estado'],
        });
        const enJornada = asistenciaHoy?.estado === 'EN_JORNADA';
        res.json({
            en_jornada: enJornada,
            asistencia_id: enJornada ? asistenciaHoy!.id : null,
        });
    }catch(err){
        res.status(500).json({ message: 'Error al consultar tu estado.', err});
    }
};

/*
Camino B, paso 2: el Supervisor o el Escaner (cuenta fija del punto de control) escanea el QR flotante de otro
dispositivo y lo manda aqui. Requiere JWT de tipo 'usuario' con rol SUPERVISOR o ESCANER (ver requireRol en la ruta).
*/
export const marcarConQrSesion = async(req:Request, res:Response):Promise<void> => {
    try{
        const { qr_token, actividades_ids, foto_ingreso } = req.body;
        if(!qr_token){
            res.status(400).json({ message: 'qr_token es obligatorio.'});
            return;
        }

        let payload;
        try{
            payload = verificarTokenQrJornada(qr_token);
        }catch{
            res.status(401).json({ message: 'El QR es invalido o ya expiro (se renueva cada 90 segundos).'});
            return;
        }

        const operador = await Operador.findByPk(payload.operador_id);
        if(!operador){
            res.status(404).json({ message: 'Operador no encontrado.'});
            return;
        }

        const haciendaPropia = await resolverHaciendaPropia(operador);
        const haciendaEscaner = req.auth?.hacienda_id ?? null;
        const esPrestamo = haciendaEscaner !== null && haciendaPropia !== null && haciendaPropia !== haciendaEscaner;

        const contexto: ContextoMarcacion = {
            ...(esPrestamo ? { hacienda_prestamo_id: haciendaEscaner, admitido_por_usuario_id: req.auth!.id } : {}),
            // El Camino B ya tiene el detalle real de la jornada en el Panel de Actividades (RegistroActividad) -
            // no hace falta pedirle a quien escanea que elija actividades otra vez para poder cerrar la salida.
            omitirActividadRequerida: true,
        };

        /*
        Si el trabajador YA tiene una jornada abierta, este escaneo va a ser una SALIDA - en vez de exigir que
        quien escanea elija actividades a mano (redundante, ya se registraron en el Panel de Actividades),
        derivamos la lista de actividades directamente de sus RegistroActividad de hoy, para que el resumen
        (AsistenciaActividad, lo que ve el Supervisor en su panel) no quede vacio.
        */
        let actividadesIdsFinal = actividades_ids;
        const asistenciaAbierta = await Asistencia.findOne({ where: { operador_id: operador.id, estado: 'EN_JORNADA' } });
        if(asistenciaAbierta && (!Array.isArray(actividades_ids) || actividades_ids.length === 0)){
            const registros = await RegistroActividad.findAll({
                where: { asistencia_id: asistenciaAbierta.id },
                attributes: ['actividad_id'],
            });
            actividadesIdsFinal = [...new Set(registros.map((r) => r.actividad_id))];
        }

        const { status, body } = await procesarMarcacion(operador, { actividades_ids: actividadesIdsFinal, foto_ingreso }, contexto);
        res.status(status).json(body);
    }catch(err){
        res.status(500).json({ message: 'Error procesando la marcacion por QR de sesion.', err});
    }
};

/*
Calcula si un DIA (una fecha puntual) ya esta "cerrado" en el sentido operativo: nadie sigue EN_JORNADA/
PENDIENTE_REVISION Y todos los registros de ese dia ya fueron confirmados (O/X) por el Supervisor. Lo comparten
obtenerAsistenciaHoy (el flag `diaCerrado` que muestra) y revisarAsistencia (que lo usa para congelar
observaciones) - antes revisarAsistencia miraba solo el `estado` de ESE registro puntual, lo que congelaba la
observacion de un trabajador que se autocerro (SALIDA_OLVIDADA) mucho antes de que el Supervisor terminara de
revisar a los demas. Las observaciones tienen que poder editarse hasta que el DIA COMPLETO quede cerrado, no
fila por fila.
*/
const calcularDiaCerrado = async (fecha: string): Promise<boolean> => {
    const total = await Asistencia.count({ where: { fecha } });
    if(total === 0) return false;
    const totalAbiertos = await Asistencia.count({
        where: {
            fecha,
            [Op.or]: [
                { estado: { [Op.in]: ['EN_JORNADA','PENDIENTE_REVISION']} },
                { confirmado_por_supervisor: null },
            ],
        },
    });
    return totalAbiertos === 0;
};

//Obtener reporte diario de asistencia
export const obtenerAsistenciaHoy = async(req:Request, res:Response):Promise<void> =>{
    try{
        //Si viene fecha por query la usamos de lo contrario usamos la fecha local
        const fechaQuery = req.query['fecha'] as string;
        const hoy = fechaQuery || getFetchLocalEcuador();
        //Paginacion: misma logica que el Historial, para que el Supervisor tampoco le llegue de golpe toda la lista del dia
        const paginaActual = Math.max(1, Number(req.query['pagina']) || 1);
        const limitePagina = Math.min(100, Math.max(1, Number(req.query['limite']) || 30));
        const offset = (paginaActual - 1) * limitePagina;

        /*
        Filtro opcional por supervisor (lo usa el panel de ADMIN, que ve TODAS las haciendas mezcladas en esta
        pantalla - a diferencia de un Supervisor real, que solo tiene la suya - para poder acotar a lo que hizo
        un Supervisor puntual). Mismo patron que en obtenerHistorial: filtra operador.supervisor_id directo.
        No afecta a calcularDiaCerrado (mas abajo) a proposito - "Cerrar Jornada" sigue cerrando el dia completo
        sin importar el filtro de vista, ver Deuda tecnica heredada en CLAUDE.md sobre finalizarDia y hacienda_id.
        */
        const supervisorIdQuery = req.query['supervisor_id'];
        const filtrarPorSupervisor = supervisorIdQuery !== undefined && supervisorIdQuery !== '';

        const { rows:asistencias, count:total } = await Asistencia.findAndCountAll({
            where: { fecha:hoy },
            attributes: ATRIBUTOS_SIN_FOTO,
            /*
            paranoid:false en los 3 includes: si el Operador/Actividad de una marcacion de HOY fue eliminado
            (soft-delete) despues de que marco, el Panel de Supervisor tiene que seguir mostrando su nombre para
            poder confirmar O/X - un catalogo eliminado no debe borrar una marcacion ya hecha.
            */
            include: [
                {
                    model: Operador, as:'operador',
                    required: filtrarPorSupervisor,
                    paranoid: false,
                    ...(filtrarPorSupervisor ? { where: { supervisor_id: Number(supervisorIdQuery) } } : {}),
                },
                { model: Actividad, as:'actividad', paranoid: false},
                { model: Actividad, as:'actividades', paranoid: false},
            ],
            order: [['hora_ingreso','DESC']],
            limit: limitePagina,
            offset,
            /*
            El include de 'actividades' es un JOIN muchos-a-muchos: sin 'distrinct el count quedaria inflaso (una vez por cada actividad
            vinculada, no por registro).'
            */
           distinct: true
        });
        /*
        El "dia cerrado" se calcula sobre TODOS los registros del dia, no solo la pagina visible- si no, el boton "CERRAR JORNADA" quedaria
        hanilitado/deshabilido segun que pagina este mirando el supervisor, en vez del estado real del dia completo
        (ver calcularDiaCerrado arriba - no basta con que nadie siga EN_JORNADA/PENDIENTE_REVISION, tambien exige
        que el Supervisor haya confirmado O/X a todos).
        */
       const diaCerrado = await calcularDiaCerrado(hoy);

        res.json({
            data: asistencias,
            total,
            pagina:paginaActual,
            totalPaginas: Math.ceil(total / limitePagina) || 1,
            diaCerrado,
        });
    } catch(error){
        res.status(500).json({message:'Error al obtener asustencias', error});
    }
};

// Cierre de jornada ejecutando por el Supervisor
export const finalizarDia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { fecha } = req.body;
        const fechaProcesar = fecha || getFetchLocalEcuador();

        /*
        Verificamos el estado actual de la jornada antes de tocar nada: si ya queda ningun registro pendiente
        de revision, es por que el dia ya fue cerrado antes.
        */
       const registroDelDia = await Asistencia.findAll({
            where: {fecha: fechaProcesar},
            // paranoid:false: el operador pudo haber sido eliminado (soft-delete) despues de marcar hoy - su
            // nombre igual tiene que poder aparecer en "Falta confirmar la asistencia de: ..." mas abajo.
            include: [{ model: Operador, as: 'operador', attributes: ['nombre_completo'], paranoid: false }],
       });
        if(registroDelDia.length === 0 ){
            res.status(404).json({
                message:`No hay marcaciones registradas para el ${fechaProcesar}.`
            });
            return;
        }

        /*
        El cierre de dia no se puede saltar el chequeo O/X del Supervisor: si un trabajador se autocerro
        (SALIDA_OLVIDADA) sin que el Supervisor lo haya confirmado, cerrar la jornada igual dejaria pasar
        exactamente el caso que O/X existe para atrapar (alguien paso su codigo/QR a un companero). Se avisa
        con nombre y apellido para que el Supervisor sepa a quien le falta revisar.
        */
        const sinConfirmar = registroDelDia.filter((r) => r.confirmado_por_supervisor === null);
        if(sinConfirmar.length > 0){
            const nombres = sinConfirmar.map((r) => r.operador?.nombre_completo || `operador #${r.operador_id}`);
            res.status(400).json({
                message: `Falta confirmar (O/X) la asistencia de: ${nombres.join(', ')}.`,
                faltan_confirmar: nombres,
            });
            return;
        }

        const quedanPendientes = registroDelDia.some(
            (r) => r.estado == 'EN_JORNADA' || r.estado === 'PENDIENTE_REVISION'
        );
        if(!quedanPendientes){
            res.status(400).json({
                message:`La jornada del ${fechaProcesar} ya fue cerrada anteriormente.`,
                ya_cerrado : true
            });
            return;
        }

        // 1.Aprobar marcaciones en PENDIENTE_REVISION -> FINALIZADO
        const [aprobados] = await Asistencia.update(
            { estado: 'FINALIZADO'},
            {
                where:{
                    fecha: fechaProcesar,
                    estado: 'PENDIENTE_REVISION'
                }
            }
        );

        // 2. Marcar operadores olvidados (se quedaron en EN_JORNADA) -> SALIDA_OLVIDADA
        const [olvidados] = await Asistencia.update(
            {estado:'SALIDA_OLVIDADA'},
            {
                where:{
                    fecha: fechaProcesar,
                    estado: 'EN_JORNADA'
                }
            }
        );

        res.json({
            message: `Jornada del ${fechaProcesar} cerrada con exito.`,
            resumen: {
                registros_finalizados: aprobados,
                salidas_olvidadas: olvidados
            }
        });

    }catch(err){
        res.status(500).json({ message: 'Error al ejecutar el cierre del dia', err});
    }
};

// Historial con filtros opcionales de fechas
export const obtenerHistorial = async(req:Request, res:Response):Promise<void> => {
    try{
        const { fecha_inicio, fecha_fin, operador_id, hacienda_id, supervisor_id } = req.query;
        const whereCondition:any = {};

        // Filtro por rango de fecha
        if(fecha_inicio && fecha_fin){
            whereCondition.fecha = {
                [Op.between]:[String(fecha_inicio), String(fecha_fin)]
            };
        } else if(fecha_inicio){
            whereCondition.fecha = String(fecha_inicio);
        }

        // Filtro opcional por operador
        if(operador_id){
            whereCondition.operador_id = Number(operador_id);
        }

        /*
        El Historial de Asistencia es la auditoria OFICIAL: solo debe mostrar jornadas que el supervisor ya reviso y cerro(FINALIZADO/SALIDA_OLVIDADA),
        nunca marcaciones todavia en curso (EN_JORNADA) o pendiente de revision (PENDIENTE_REVISION).

        confirmado_por_supervisor no nulo: un trabajador puede autocerrar su PROPIA jornada como SALIDA_OLVIDADA
        sin que el Supervisor la haya revisado (autoservicio "no podre marcar salida", ver marcarSalidaOlvidada) -
        eso deja estado en SALIDA_OLVIDADA de inmediato, sin pasar por finalizarDia, que es quien normalmente
        exige el O/X del Supervisor antes de cerrar el dia. Sin este filtro, esa jornada aparecia en el Historial
        apenas el trabajador se autocerraba, como si fuera "en tiempo real" - antes de que el Supervisor hiciera
        su revision o cerrara el dia. Se exige la misma condicion que finalizarDia ya exige (confirmado_por_supervisor
        !== null) para que el Historial nunca muestre nada que el Supervisor no haya revisado todavia.
        */
        whereCondition.estado = { [Op.in] : ['FINALIZADO','SALIDA_OLVIDADA']};
        whereCondition.confirmado_por_supervisor = { [Op.ne]: null };

        /*
        Paginacion: sin esto, un filtro de "todo el ano" intentaria devolver miles de registros (con sus fotos, si no los hubieramos excluido arriba)
        en una sola respuesta.
        */
       const paginaActual = Math.max(1, Number(req.query['pagina']) || 1);
       const limitePagina = Math.min(100, Math.max(1, Number(req.query['limite']) || 30));
       const offset = (paginaActual -1) * limitePagina;

        /*
        Filtro opcional por hacienda o por supervisor: el Operador no tiene hacienda_id propio (vive del
        Supervisor al que pertenece de forma permanente, ver CLAUDE.md), asi que "hacienda" se filtra via el
        include anidado operador -> supervisor -> hacienda_id, y "supervisor" directo sobre
        operador.supervisor_id (lo usa el panel de ADMIN para ver solo lo que hizo un Supervisor puntual, sin
        tener que saber a que hacienda pertenece). `required: true` en 'operador' cuando hay CUALQUIERA de los
        dos filtros convierte el include en INNER JOIN (si no, Sequelize lo deja LEFT JOIN y el where anidado no
        filtra nada).
        */
        const filtrarPorHacienda = hacienda_id !== undefined && hacienda_id !== '';
        const filtrarPorSupervisor = supervisor_id !== undefined && supervisor_id !== '';
        const { rows:historial, count:total } = await Asistencia.findAndCountAll({
            where: whereCondition,
            attributes:ATRIBUTOS_SIN_FOTO,
            /*
            paranoid:false en Operador/Actividad: el Historial es la auditoria OFICIAL de jornadas ya cerradas -
            si el Operador o alguna Actividad fue eliminado (soft-delete) DESPUES de esa jornada, el registro
            historico tiene que seguir mostrando su nombre igual, no desaparecer del reporte.
            */
            include:[
                {
                    model: Operador, as: 'operador',
                    required: filtrarPorHacienda || filtrarPorSupervisor,
                    paranoid: false,
                    ...(filtrarPorSupervisor ? { where: { supervisor_id: Number(supervisor_id) } } : {}),
                    include: [{
                        model: Usuario, as: 'supervisor',
                        attributes: [],
                        ...(filtrarPorHacienda ? { where: { hacienda_id: Number(hacienda_id) } } : {}),
                    }],
                },
                { model: Actividad, as: 'actividad', paranoid: false },
                { model: Actividad, as: 'actividades', paranoid: false },
            ],
            order: [['fecha','DESC'],['hora_ingreso','DESC']],
            limit: limitePagina,
            offset,
            //El include de 'actividades' es un JOIN muchos-a-muchos: sin 'distinct' el count quedaria inflado (cuenta una vez por cada actividad
            //vinculada, no por registro).
            distinct: true,
        });

        //Calculamos las horas trabajadas de cada registro(campo derivado, no vive en la BD)
        const historialConHoras = historial.map((registro) => {
            const datos = registro.toJSON() as any;
            let total_horas: number | null = null;

            if(datos.hora_ingreso && datos.hora_salida){
                const milisegundos = new Date(datos.hora_salida).getTime() - new Date(datos.hora_ingreso).getTime();

                total_horas = Math.round((milisegundos / (1000 *60 * 60)) * 100) / 100;
            }

            return {...datos, total_horas};
        });

        res.json({
            data: historialConHoras,
            total,
            pagina: paginaActual,
            totalPaginas: Math.ceil(total / limitePagina) || 1,
        });

    } catch(err){
        res.status(500).json({ message: 'Error al consultar el historial del asistencia', err});
    }
};

/*
Devuelve UNICAMENTE la foto de un registro puntual. Sellama recien cuando el usuario hace click en "Ver Evidencia" (ver ATRIBUTOS_SIN_FOTO): asi los listados
(hoy/historial) nunca cargan fotos que nadie pidio ver
*/
export const obtenerFotoAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;

        const asistencia = await Asistencia.findByPk(Number(id), {
            attributes: ['id', 'foto_ingreso'],
        });
        if(!asistencia){
            res.status(404).json({ message: 'Registro de asistencia no encontrado.'});
            return;
        }

        if(!asistencia.foto_ingreso){
            res.status(404).json({ message: 'Este registro no tiene foto de evidencia.'});
            return;
        }

        res.json({ foto_ingreso: asistencia.foto_ingreso });

    } catch(err){
        res.status(500).json({ message: 'Error al obtener la foto de evidencia.', err});
    }
}

/*
Admiti Trabajador Externo: el trabajador prestado escanea su QR igual que siempre (eso ya crea su Asistencia de hoy bajo el flujo normal).
Esta accion es la que hace el Supervisor RECEPTOR para reclamar esa jornada como propia de su haceinda, dejando trazabilidad de quien lo asmitio.
Requiere de JWT con el rol SUPERVISOR(ver requiereROL en la ruta).
*/
export const admitirTrabajadorExterno = async(req:Request, res:Response):Promise<void> => {
    try{
        const { operador_id } = req.body;
        if(!operador_id){
            res.status(400).json({ message:'operador_id es obligatorio.'});
            return;
        }
        if(!req.auth?.hacienda_id){
            res.status(400).json({ message:'Tu usuario no tiene una hacienda asignada.'});
            return;
        }

        const operador = await Operador.findByPk(Number(operador_id));
        if(!operador){
            res.status(404).json({message:'El operador indicado no existe.'});
            return;
        }

        //La hacienda "de casa" del operdaor es la de su Supervisor permanente.
        let haciendaPropia: number | null=null;
        if(operador.supervisor_id){
            const supervisorPropio = await Usuario.findByPk(operador.supervisor_id);
            haciendaPropia = supervisorPropio?.hacienda_id ?? null;
        }
        if(haciendaPropia === req.auth.hacienda_id){
            res.status(400).json({message:'Este trabajador ya pertenece a tu haceinda: no necesita se admitido.'});
            return;
        }

        //El trabajador debe haber marcado su ingreso de hoy antes de poder admitirlo.
        const hoy= getFetchLocalEcuador();
        const asistenciaHoy = await Asistencia.findOne({
            where : { operador_id: operador.id, fecha:hoy},
        });
        if(!asistenciaHoy){
            res.status(404).json({ message:'Este trabajador todavia no ha marcado su ingreso de hoy.'});
            return;
        }

        await asistenciaHoy.update({
            hacienda_prestamo_id: req.auth.hacienda_id,
            admitido_por_usuario_id: req.auth.id,
        });

        res.json({
            message:'Trabajador externo admitido correctamente.',
            asistencia: asistenciaHoy
        });

    }catch(err){
        res.status(500).json({ message:'Error al admitir al trabajador externo.',err});

    }
};

/*
Reseteo de clave del Operador(Mecanico/Operador):quien lo resetea fija una nueva, nunca puede ver la anterior (el hash no es 
reversible). Requiere JWT con rol ADMIN o ASISTIENTE.
*/
export const resetearClaveOperador = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { clave } = req.body;

        if(!clave || clave.length < 8){
            res.status(400).json({message:'La clave debe tener al menos 8 caracteres.'});
            return;
        }

        const operador = await Operador.findByPk(Number(id));
        if(!operador){
            res.status(404).json({message:'Operador no encontrado.'});
            return;
        }
        if(!operador.usuario){
            res.status(400).json({message:'Este operador todavia no tiene usuario de acceso configurado'});
            return;
        }

        const clave_hash = await bcrypt.hash(clave, 10);
        // sesion_valida_desde: mismo motivo que en resetearClaveUsuario (usuario.controller.ts) - invalida
        // cualquier JWT de este Operador emitido antes de este instante.
        await operador.update({ clave_hash, sesion_valida_desde: new Date() });

        await registrarAuditoria({
            actorUsuarioId: req.auth!.id,
            accion: 'RESETEAR_CLAVE_OPERADOR',
            objetivoTipo: 'operador',
            objetivoId: operador.id,
            objetivoNombre: operador.nombre_completo,
        });

        res.json({ message:'Clave del operador actualizada correctamente.'});

    }catch(error){
        res.status(500).json({message:'Error al resetear la clave del operador.',error});

    }
};

//Edicion/Revision por parte del Supervisor(Ajustes de hora, estado u observacciones)
export const revisarAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{

        const { id } = req.params;
        const { hora_salida, observaciones, estado, actividad_id } = req.body;

        const asistencia = await Asistencia.findByPk(Number(id));
        if(!asistencia){
            res.status(404).json({ message: "Registro de asistencia no encontrado."});
            return;
        }

        /*
        Datos congelados: pero a nivel de DIA completo (ver calcularDiaCerrado), no de este registro puntual - un
        trabajador puede autocerrarse (SALIDA_OLVIDADA) mucho antes de que el Supervisor termine de confirmar O/X
        a los demas, y eso no debe congelar SU observacion mientras el dia sigue abierto para el resto.
        */
       if(await calcularDiaCerrado(asistencia.fecha)){
        res.status(400).json({
            message:'La jornada de este día ya fue cerrada y no se puede modificar.'
        });
        return;
       }

        await asistencia.update({
            hora_salida: hora_salida ?? asistencia.hora_salida,
            observaciones: observaciones ?? asistencia.observaciones,
            estado: estado ?? asistencia.estado,
            actividad_id: actividad_id ? Number(actividad_id) : asistencia.actividad_id,
        });

        res.json({
            message:"Asistencia actualizada por el supervisor.",
            asistencia
        });

    }catch(err){
        res.status(500).json({ message:"Error al revisar la asistencia.",err });

    }
}

/*
O/X del Supervisor: al lado de cada trabajador que le aparece logueado hoy en su panel, el Supervisor confirma si
de verdad vino. presente=true (O) solo deja la marca de confirmado. presente=false (X) ademas mueve el estado a
OBSERVANDO y genera una observacion automatica, para que quede visible en Auditoria (Panel de Asistente) por que
esa jornada no cuenta como valida. Requiere JWT con rol SUPERVISOR o ADMIN (ver ruta).

A diferencia de revisarAsistencia (que SI queda bloqueado una vez FINALIZADO/SALIDA_OLVIDADA, ver arriba), esto
NO se congela cuando el registro ya se cerro: la confirmacion del Supervisor es su observacion directa de la
realidad (¿este trabajador vino hoy, si o no?), independiente de si el trabajador ya marco su propia salida en
el sistema (con codigo/QR, o incluso SALIDA_OLVIDADA autoservicio). Decision de negocio: el Token de Hacienda
puede circular entre trabajadores sin que el Supervisor lo note al momento, asi que necesita poder marcar X
aunque la jornada de ese trabajador ya haya quedado formalmente cerrada - eso es justo lo que la reabre a
OBSERVANDO para que quede visible en Auditoria.
*/
export const confirmarAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { presente } = req.body;

        if(typeof presente !== 'boolean'){
            res.status(400).json({ message: 'presente es obligatorio y debe ser true (O) o false (X).'});
            return;
        }

        const asistencia = await Asistencia.findByPk(Number(id));
        if(!asistencia){
            res.status(404).json({ message: 'Registro de asistencia no encontrado.'});
            return;
        }

        if(presente){
            await asistencia.update({ confirmado_por_supervisor: true });
        }else{
            const nota = `[${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}] Marcado como NO presente por el supervisor.`;
            await asistencia.update({
                confirmado_por_supervisor: false,
                estado: 'OBSERVANDO',
                observaciones: asistencia.observaciones ? `${asistencia.observaciones}\n${nota}` : nota,
            });
        }

        res.json({ message: 'Confirmacion registrada.', asistencia });
    }catch(err){
        res.status(500).json({ message: 'Error al confirmar la asistencia.', err});
    }
};