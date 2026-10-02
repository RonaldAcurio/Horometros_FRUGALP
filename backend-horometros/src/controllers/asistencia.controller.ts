import { Request, Response } from 'express';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Actividad } from '../models';
import { Op, literal } from 'sequelize';
import { AsistenciaActividad, RegistroActividad, CierreJornada } from '../models';
import { Usuario } from '../models/usuario';
import { Hacienda } from '../models/hacienda';
import bcrypt from 'bcryptjs';
import { generarTokenQrJornada, verificarTokenQrJornada, PayloadToken } from '../services/jwt.service';
import { tokenHaciendaVigente } from '../utils/token-hacienda';
import { registrarAuditoria } from '../utils/registrar-auditoria';
import { cifrarDeterministico } from '../utils/cifrado';
import { subirFoto, obtenerFotoBase64, r2EstaConfigurado } from '../services/r2.service';

/*
Columnas que excluimos de los LISTADOS (hoy/historial): la foto pesa decenas/cientos de KB en Base64, y si el supervisor tiene
70 registros en pantalla no tiene sentido bajarlas todas de una. 
En su lugar mandamos "tiene_fot" (un booleano liviano) y la foto real se pide aparte, solo cuando el usuario hace clic en "ver-Evidencia"
(ver obtenerFotoAsistencia).
*/
const ATRIBUTOS_SIN_FOTO = {
    exclude: ['foto_ingreso', 'foto_r2_key'],
    include: [[literal('"foto_ingreso" IS NOT NULL OR "foto_r2_key" IS NOT NULL'), 'tiene_foto']] as any,
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
    const { supervisor_id } = req.body;
    // Recortar espacios al inicio/final ANTES de guardar - ver auth.controller.ts (login), mismo motivo real
    // (2026-09-30): un espacio pegado por el celular quedaba GUARDADO dentro del hash y ni el login lo salvaba.
    const usuario = typeof req.body.usuario === 'string' ? req.body.usuario.trim() : req.body.usuario;
    const clave = typeof req.body.clave === 'string' ? req.body.clave.trim() : req.body.clave;

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
        // Comparacion sin distinguir mayusculas: evita crear dos cuentas que solo difieran en eso (ver login,
        // auth.controller.ts, que ya busca asi) y quedarian indistinguibles para el trabajador.
        const usuarioLike = { [Op.iLike]: usuario };
        const usuarioExistente = await Usuario.findOne({ where: { usuario: usuarioLike }});
        const operadorConMismoUsuario = await Operador.findOne({
            where: idAExcluir ? { usuario: usuarioLike, id: { [Op.ne]: idAExcluir } } : { usuario: usuarioLike },
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
        // Limites reales de columna (ver models/operador.ts) - sin este chequeo, un codigo/nombre demasiado
        // largo llegaba hasta el INSERT y Postgres lo rechazaba con un error crudo que el catch de abajo
        // convertia en un 500 generico ("Error al crear el operador. Intenta de nuevo."), sin decirle al
        // usuario CUAL de los dos campos esta mal ni por que.
        if(codigo_megued.length > 20){
            res.status(400).json({message: `El código MEGUED no puede tener más de 20 caracteres (tiene ${codigo_megued.length}).`});
            return;
        }
        if(nombre_completo.length > 150){
            res.status(400).json({message: `El nombre completo no puede tener más de 150 caracteres (tiene ${nombre_completo.length}).`});
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

/*
Importar Trabajadores desde Excel - mismo patron que importarEquipos/importarActividades (ver equipo.controller.ts):
reporta fila por fila que se creo y que se rechazo en vez de fallar todo-o-nada, con 'paranoid:false' en el
chequeo de duplicados (bug real ya encontrado antes con equipos/actividades eliminados que siguen ocupando su
codigo/cedula a nivel de UNIQUE aunque no aparezcan en un findAll() normal). La columna SUPERVISOR es opcional:
si viene, se resuelve por nombre contra los Usuarios con cargo SUPERVISOR (asi el trabajador queda vinculado a
la hacienda correspondiente sin que el archivo tenga que conocer IDs internos).
*/
/*
Investiga, RECIEN cuando el INSERT de una fila ya chocó de verdad contra el UNIQUE de Postgres, si fue por
codigo_megued o por cedula (o ambos) y si el dueño actual esta soft-deleted o activo - consulta directa a la BD
en vez de comparar contra un mapa pre-armado. Mismo motivo que describirColisionEquipo en equipo.controller.ts:
un caso real (2026-09-30) demostró que el chequeo previo (findAll(paranoid:false) + Map ANTES del insert) puede
fallar a detectar un choque real. 'cedula' se busca con su valor YA CIFRADO (cifrarDeterministico), igual que el
resto de este archivo (ver comentario de verificarDuplicadosOperador) porque el where: no pasa por el set() del
modelo.
*/
const describirColisionOperador = async (codigo: string, cedulaCifrada: string | null): Promise<string> => {
    const [porCodigo, porCedula] = await Promise.all([
        Operador.findOne({ where: { codigo_megued: codigo }, paranoid: false }),
        cedulaCifrada ? Operador.findOne({ where: { cedula: cedulaCifrada as any }, paranoid: false }) : Promise.resolve(null),
    ]);
    const piezas: string[] = [];
    if (porCodigo) {
        piezas.push(porCodigo.deletedAt
            ? `el código "${codigo}" perteneció a un trabajador eliminado antes - pide a un Admin que lo recupere si hace falta`
            : `ya existe un trabajador con el código "${codigo}"`);
    }
    if (porCedula) {
        piezas.push(porCedula.deletedAt
            ? `la cédula perteneció a un trabajador eliminado antes - pide a un Admin que lo recupere si hace falta`
            : `ya existe un trabajador con esa cédula`);
    }
    if (piezas.length === 0) {
        return `El código "${codigo}" o la cédula ya están en uso.`;
    }
    return piezas.join(' y ') + '.';
};

export const importarOperadores = async (req: Request, res: Response): Promise<void> => {
    try {
        const items = req.body.items;
        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ message: 'No se recibió ningún trabajador para importar.' });
            return;
        }
        if (items.length > 2000) {
            res.status(400).json({ message: 'Máximo 2000 filas por importación - divide el archivo en partes más pequeñas.' });
            return;
        }

        const supervisores = await Usuario.findAll({ where: { cargo: 'SUPERVISOR' }, attributes: ['id', 'nombre_completo'] });
        const supervisorPorNombre = new Map(supervisores.map((s) => [s.nombre_completo.trim().toLowerCase(), s.id]));

        const rechazados: { fila: number; motivo: string }[] = [];
        const codigosEnArchivo = new Set<string>();
        const cedulasEnArchivo = new Set<string>();
        let creados = 0;

        for (let index = 0; index < (items as unknown[]).length; index++) {
            // fila 2 en el Excel = primer registro (la fila 1 es el encabezado).
            const fila = index + 2;
            const datos = (items as unknown[])[index] as { nombre_completo?: unknown; rol?: unknown; codigo_megued?: unknown; cedula?: unknown; supervisor?: unknown };
            const nombre = String(datos?.nombre_completo ?? '').trim();
            const codigo = String(datos?.codigo_megued ?? '').trim();
            const rolCrudo = String(datos?.rol ?? '').trim();
            const cedula = String(datos?.cedula ?? '').trim();
            const supervisorTexto = String(datos?.supervisor ?? '').trim();

            if (!nombre || !codigo) {
                rechazados.push({ fila, motivo: 'Falta el nombre o el código del trabajador.' });
                continue;
            }
            if (codigo.length > 20) {
                rechazados.push({ fila, motivo: `El código "${codigo}" supera los 20 caracteres permitidos.` });
                continue;
            }
            if (nombre.length > 150) {
                rechazados.push({ fila, motivo: 'El nombre supera los 150 caracteres permitidos.' });
                continue;
            }

            let rol: 'MECANICO' | 'OPERADOR' = 'MECANICO';
            if (rolCrudo) {
                const rolMayus = rolCrudo.toUpperCase();
                if (!ROLES_OPERADOR_VALIDOS.includes(rolMayus)) {
                    rechazados.push({ fila, motivo: `El cargo "${rolCrudo}" debe ser MECANICO u OPERADOR.` });
                    continue;
                }
                rol = rolMayus as 'MECANICO' | 'OPERADOR';
            }

            const codigoLower = codigo.toLowerCase();
            if (codigosEnArchivo.has(codigoLower)) {
                rechazados.push({ fila, motivo: `El código "${codigo}" está repetido dentro del archivo.` });
                continue;
            }

            let cedulaCifrada: string | null = null;
            if (cedula) {
                cedulaCifrada = cifrarDeterministico(cedula) as string;
                if (cedulasEnArchivo.has(cedulaCifrada)) {
                    rechazados.push({ fila, motivo: `La cédula "${cedula}" está repetida dentro del archivo.` });
                    continue;
                }
            }

            let supervisor_id: number | null = null;
            if (supervisorTexto) {
                const idEncontrado = supervisorPorNombre.get(supervisorTexto.toLowerCase());
                if (!idEncontrado) {
                    rechazados.push({ fila, motivo: `No se encontró ningún Supervisor con el nombre "${supervisorTexto}" - revisa que coincida exacto con el nombre registrado en el sistema.` });
                    continue;
                }
                supervisor_id = idEncontrado;
            }

            try {
                await Operador.create({ nombre_completo: nombre, codigo_megued: codigo, rol, cedula: cedula || null, supervisor_id } as any);
                codigosEnArchivo.add(codigoLower);
                if (cedulaCifrada) cedulasEnArchivo.add(cedulaCifrada);
                creados++;
            } catch (err: any) {
                if (err.name === 'SequelizeUniqueConstraintError') {
                    rechazados.push({ fila, motivo: await describirColisionOperador(codigo, cedulaCifrada) });
                    continue;
                }
                throw err;
            }
        }

        res.status(201).json({ creados, rechazados });
    } catch (err: any) {
        console.error('Error al importar trabajadores.', err);
        res.status(500).json({ message: 'Error al importar trabajadores.' });
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
/*
Sin 'pagina'/'limite' en la query devuelve el arreglo completo (mismo patron que ObtenerActividades,
actividades.controller.ts, para no romper a nadie que todavia dependa del arreglo plano). Con 'pagina'/'limite'
responde paginado - lo usa el Directorio de Operadores (Panel de Asistente), que antes traia TODO de una sola
vez y salio medible mas lento que el resto de listados en la prueba de carga (ver CLAUDE.md, "Pruebas de
carga") apenas el volumen se acerca a los ~950 operadores reales.
'q' (solo en modo paginado) filtra por nombre_completo/codigo_megued con LIKE, y por cedula con IGUALDAD
EXACTA - la cedula esta cifrada en la BD (ver models/operador.ts) con cifrado DETERMINISTICO, que preserva
igualdad pero NO permite un LIKE de substring sobre el texto plano (cifrar "12" nunca es un prefijo de cifrar
"12345678"). Buscar el nombre/codigo completo o parcial funciona igual que antes; buscar la cedula requiere
escribirla completa.
*/
export const obtenerOperadores = async(req: Request, res:Response):Promise<void> => {
    try{
        const { pagina: paginaQuery, limite: limiteQuery, q: qQuery } = req.query;
        const include = [{ model: Usuario, as: 'supervisor', attributes: { exclude: ['clave_hash'] } }];
        const attributes = { exclude: ['clave_hash'] };

        if(paginaQuery === undefined && limiteQuery === undefined){
            const operadores = await Operador.findAll({
                attributes,
                include,
                order: [['nombre_completo','ASC']],
            });
            res.json(operadores);
            return;
        }

        const pagina = Math.max(1, Number(paginaQuery) || 1);
        const limite = Math.min(100, Math.max(1, Number(limiteQuery) || 20));
        const offset = (pagina - 1) * limite;
        const q = typeof qQuery === 'string' ? qQuery.trim() : '';

        const where = q ? {
            [Op.or]: [
                { nombre_completo: { [Op.iLike]: `%${q}%` } },
                { codigo_megued: { [Op.iLike]: `%${q}%` } },
                { cedula: cifrarDeterministico(q) },
            ],
        } : {};

        const { rows: operadores, count: total } = await Operador.findAndCountAll({
            where,
            attributes,
            include,
            order: [['nombre_completo','ASC']],
            limit: limite,
            offset,
        });

        res.json({ data: operadores, total, pagina, totalPaginas: Math.ceil(total / limite) || 1 });
    } catch(err){
        console.error('Error al obtener operdadores', err);
        res.status(500).json({ message: 'Error al obtener operdadores' });
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
    /*
    Caminos SIN pantalla propia para preguntarle nada al trabajador (kiosco/carnet fisico, codigo publico sin
    sesion, QR escaneado por Supervisor/Escaner) - si se topan con una jornada ambigua de ayer (ver mas abajo),
    no hay forma de mostrar la pregunta "¿cerrar esa o empezar una nueva?", asi que se decide sola por
    'iniciar_nuevo' (lo mas probable en la practica: alguien escaneando HOY casi siempre esta lidiando con la
    entrada de HOY, no viene a cerrar algo de ayer a mano). Solo el camino codigo autenticado (marcarConMiCodigo,
    con pantalla propia en mi-jornada.ts) deja esto en false y de verdad pregunta.
    */
    permiteAutoDecidirJornadaAnterior?: boolean;
}

// Diferencia en DIAS CALENDARIO entre 2 fechas 'YYYY-UU-MM' (ambas ya vienen de getFetchLocalEcuador, mismo
// formato) - Date() parsea 'YYYY-MM-DD' como medianoche UTC, asi que restar y dividir por 1 dia da un entero
// exacto sin arrastrar horas/minutos de por medio.
const diferenciaEnDiasCalendario = (fechaAnterior: string, fechaActual: string): number => {
    const MS_POR_DIA = 24 * 60 * 60 * 1000;
    return Math.round((new Date(fechaActual).getTime() - new Date(fechaAnterior).getTime()) / MS_POR_DIA);
};

/*
Sube la foto de evidencia a R2 (fuera de la base de datos, ver CLAUDE.md) y devuelve donde debe quedar
guardada. Si R2 no esta configurado o la subida falla por cualquier motivo, cae de vuelta al comportamiento
viejo (guardar el base64 completo en 'foto_ingreso') - la marcacion de asistencia NUNCA debe fallar solo
porque el almacenamiento de fotos tuvo un problema puntual.
*/
const prepararFotoParaGuardar = async (
    fotoDataUri: string | null | undefined,
    operadorId: number,
    momento: Date
): Promise<{ fotoIngreso: string | null; fotoR2Key: string | null }> => {
    if (!fotoDataUri) {
        return { fotoIngreso: null, fotoR2Key: null };
    }
    if (!r2EstaConfigurado()) {
        return { fotoIngreso: fotoDataUri, fotoR2Key: null };
    }
    const key = `asistencias/${operadorId}/${momento.getTime()}.jpg`;
    try {
        await subirFoto(fotoDataUri, key);
        return { fotoIngreso: null, fotoR2Key: key };
    } catch (err) {
        console.error('Error al subir foto a R2, se guarda en la base de datos como respaldo.', err);
        return { fotoIngreso: fotoDataUri, fotoR2Key: null };
    }
};

/*
Nucleo de la logica de Entrada/Salida, compartido por los 4 caminos que hoy puede tomar una marcacion:
carnet fisico (registrarMacarcoQR), codigo publico (marcarConCodigo), codigo autenticado (marcarConMiCodigo) y
QR de sesion (marcarConQrSesion). Antes esta logica vivia duplicada solo en registrarMacarcoQR; sacarla de ahi
evita que un cambio de regla de negocio (p.ej. como se cierra un turno que cruza la medianoche) se tenga que
repetir y probar 4 veces.
Devuelve {status, body} en vez de escribir directo en 'res': quien la llama decide como responder.
*/
const procesarMarcacion = async(
    operador: Operador,
    datos: { actividades_ids?: unknown; foto_ingreso?: string | null; accion_jornada_anterior?: 'cerrar' | 'iniciar_nuevo' },
    contexto: ContextoMarcacion = {}
): Promise<{ status: number; body: any }> => {
    const ahora = new Date();
    const hoy = getFetchLocalEcuador();

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
        /*
        Bug real encontrado por el usuario (2026-09-28): si el trabajador se olvida de marcar salida, su
        proximo escaneo (aunque sea al dia siguiente) caia SIEMPRE en este bloque como si fuera la salida real
        de esa jornada vieja - nunca le daba una entrada nueva, y la hora de salida quedaba pegada al momento
        del escaneo (un turno de "casi 24 horas" sin sentido). Se probo primero con un limite fijo de horas
        (ej. 22h) y se descarto: un turno nocturno legitimo (6am a 1:30am, 19.5h) y una entrada olvidada de
        mediodia con reintento a las 6am del dia siguiente (18h) se traslapan en el mismo rango de horas - no
        hay un numero que sirva para los dos casos sin fallar en alguno. En su lugar, se compara por FECHA
        CALENDARIO, no por horas:
        - Jornada de HOY: sigue de largo como una SALIDA normal (el bloque de abajo, sin cambios).
        - Jornada de 2+ dias calendario atras: ningun turno real dura tanto - se cierra sola como
          SALIDA_OLVIDADA sin preguntar nada, y el escaneo actual sigue de largo como si no hubiera nada
          abierto (cae en el Paso 2/3 de mas abajo, entrada nueva).
        - Jornada de EXACTAMENTE 1 dia atras (ayer): ambiguo de verdad - puede ser un turno nocturno que sigue
          en curso, o una salida olvidada. Si el camino que llama permite auto-decidir (ver
          ContextoMarcacion.permiteAutoDecidirJornadaAnterior - los caminos sin pantalla propia), se resuelve
          sola como 'iniciar_nuevo'. Si no (codigo autenticado, con pantalla), se le pregunta al trabajador
          (`jornada_ambigua: true` en la respuesta) y se espera que reenvie la misma peticion con
          `accion_jornada_anterior: 'cerrar' | 'iniciar_nuevo'` una vez que elija.
        */
        const diasAbierta = diferenciaEnDiasCalendario(asistencia.fecha, hoy);

        if(diasAbierta >= 2){
            await asistencia.update({ estado: 'SALIDA_OLVIDADA', hora_salida: ahora });
            asistencia = null;
        } else if(diasAbierta === 1){
            const accion = datos.accion_jornada_anterior
                ?? (contexto.permiteAutoDecidirJornadaAnterior ? 'iniciar_nuevo' : undefined);

            if(!accion){
                return {
                    status: 409,
                    body: {
                        message: 'Tienes una jornada sin cerrar desde el día anterior. ¿Qué deseas hacer?',
                        jornada_ambigua: true,
                        fecha_anterior: asistencia.fecha,
                    },
                };
            }

            if(accion === 'iniciar_nuevo'){
                await asistencia.update({ estado: 'SALIDA_OLVIDADA', hora_salida: ahora });
                asistencia = null;
            }
            // accion === 'cerrar': no se toca nada aca, sigue de largo al bloque de abajo (SALIDA normal).
        }
    }

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
    Paso 2: no tiene ninguna jornada abierta (o la de ayer se acaba de cerrar sola arriba). Antes de crear una
    ENTRADA nueva, verificamos si HOY (fecha calendario) ya completo un turno completo, para mantener la regla
    de "una jornada por dia" (evita reingresos multiples el mismo dia).
    */
    const asistenciaHoy = await Asistencia.findOne({
        where: {operador_id: operador.id, fecha: hoy},
    });
    if(asistenciaHoy){
        return {
            status: 400,
            body: { message: `El operador ${operador.nombre_completo} ya completo su jornada laboral de hoy.` },
        };
    }

    /*
    Paso 2.5: aunque para ESTE operador hoy sea una entrada nueva (no tiene jornada abierta ni ya completo la de
    hoy), hay que verificar que la HACIENDA donde esta entrando - la propia, o la PRESTADA via
    contexto.hacienda_prestamo_id, ver ContextoMarcacion - no haya ya FINALIZADO ese dia (ver
    calcularDiaCerradoHacienda abajo, version por hacienda de calcularDiaCerrado - esta SI tiene que ser
    consciente de hacienda_prestamo_id, al reves que esa). Antes esto solo quedaba bloqueado indirectamente
    para el Camino A (codigo) porque finalizarDia invalida el Token de Hacienda al cerrar - pero el Camino B
    (QR de sesion, marcarConQrSesion) y el carnet fisico (registrarMacarcoQR) nunca dependieron del token, asi
    que seguian dejando entrar aunque el dia ya estuviera cerrado (hueco real reportado por el usuario: "ni con
    QR les tiene que permitir entrar porque ya ese dia se cerro"). Se usa `hoy` (nunca una fecha pasada) a
    proposito: el dia SIGUIENTE siempre arranca en 0 registros para esa hacienda (calcularDiaCerradoHacienda
    devuelve false) y deja entrar normal, y cerrar dias atrasados uno por uno (backlog, finalizarDia con otra
    fecha) nunca toca la fecha de HOY, asi que tampoco interfiere con eso.
    */
    const haciendaIdDestino = contexto.hacienda_prestamo_id ?? await resolverHaciendaPropia(operador);
    if(haciendaIdDestino !== null && await calcularDiaCerradoHacienda(hoy, haciendaIdDestino)){
        return {
            status: 403,
            body: { message: 'El Supervisor ya finalizo la jornada de hoy en esta hacienda. Debes esperar al siguiente dia.' },
        };
    }

    //Paso 3: Entrada Nueva
    const { fotoIngreso, fotoR2Key } = await prepararFotoParaGuardar(datos.foto_ingreso, operador.id, ahora);
    asistencia = await Asistencia.create({
        operador_id: operador.id,
        fecha: hoy,
        hora_ingreso: ahora,
        estado: 'EN_JORNADA',
        foto_ingreso: fotoIngreso,
        foto_r2_key: fotoR2Key,
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

/*
Alcance de un SUPERVISOR real sobre UNA Asistencia puntual (revisarAsistencia/confirmarAsistencia/
obtenerFotoAsistencia) - antes ninguno de los 3 chequeaba esto, cualquier Supervisor podia leer/editar/
confirmar la de CUALQUIER operador del sistema con solo conocer el id (bug real de autorizacion, confirmado
por el usuario probando con 2 cuentas de Supervisor distintas). Tiene permiso si es su propio operador
(operador.supervisor_id) O si es un trabajador prestado que el ADMITIO hoy bajo su hacienda
(hacienda_prestamo_id, ver admitirTrabajadorExterno) - un Supervisor receptor SI tiene autoridad real sobre
esa jornada puntual aunque el operador sea permanentemente de otro Supervisor. ADMIN/ASISTENTE nunca quedan
restringidos aqui.
*/
const tienePermisoSupervisorSobreAsistencia = (asistencia: Asistencia, auth: PayloadToken | undefined): boolean => {
    if(!auth || auth.tipo !== 'usuario' || auth.rol !== 'SUPERVISOR') return true;
    const esDueño = asistencia.operador?.supervisor_id === auth.id;
    const esReceptorDePrestamo = asistencia.hacienda_prestamo_id !== null && asistencia.hacienda_prestamo_id === auth.hacienda_id;
    return esDueño || esReceptorDePrestamo;
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

        // permiteAutoDecidirJornadaAnterior: el kiosco no tiene pantalla para preguntar nada (ver ContextoMarcacion).
        const { status, body } = await procesarMarcacion(operador, { actividades_ids, foto_ingreso }, { permiteAutoDecidirJornadaAnterior: true });
        res.status(status).json(body);
    } catch(err){
        console.error('Error procesando marca QR', err);
        res.status(500).json({ message: 'Error procesando marca QR' });
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

        // usuario sin distinguir mayusculas/espacios de mas - mismo motivo y fix que en auth.controller.ts (login).
        const operador = await Operador.findOne({ where: { usuario: { [Op.iLike]: String(usuario).trim() } }});
        if(!operador || !operador.clave_hash){
            res.status(401).json({ message: 'Usuario o clave incorrectos.'});
            return;
        }
        // clave: mismo recorte de espacios de mas que en auth.controller.ts (login) - no cambia la sensibilidad
        // a mayusculas.
        const claveValida = await bcrypt.compare(String(clave).trim(), operador.clave_hash);
        if(!claveValida){
            res.status(401).json({ message: 'Usuario o clave incorrectos.'});
            return;
        }

        const haciendaPropia = await resolverHaciendaPropia(operador);
        const esPrestamo = haciendaPropia !== null && haciendaPropia !== hacienda.id;

        // permiteAutoDecidirJornadaAnterior: publico y sin sesion (ver docstring arriba), no hay pantalla para
        // preguntar nada (ver ContextoMarcacion).
        let contexto: ContextoMarcacion = { permiteAutoDecidirJornadaAnterior: true };
        if(esPrestamo){
            const supervisorDeAlla = await Usuario.findOne({ where: { hacienda_id: hacienda.id, cargo: 'SUPERVISOR' }});
            contexto = {
                ...contexto,
                hacienda_prestamo_id: hacienda.id,
                admitido_por_usuario_id: supervisorDeAlla?.id ?? null,
            };
        }

        const { status, body } = await procesarMarcacion(operador, { actividades_ids, foto_ingreso }, contexto);
        res.status(status).json(body);
    }catch(err){
        console.error('Error procesando la marcacion con codigo.', err);
        res.status(500).json({ message: 'Error procesando la marcacion con codigo.' });
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
        const { token_hacienda, actividades_ids, foto_ingreso, accion_jornada_anterior } = req.body;
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

        /*
        Igual que marcarConQrSesion (Camino B, más abajo): el trabajador YA registró el detalle de su jornada en
        el Panel de Actividades mientras trabajaba - si esta marcación resulta ser una SALIDA (ya tenía una
        jornada abierta), pedirle otra vez "qué actividades hiciste" mediante el checklist es redundante. Antes
        este arreglo solo se aplicó al Camino B por alcance mal acotado (ver CLAUDE.md) - Camino A también lleva
        al Panel de Actividades desde que se conectó ahí, así que le hacía falta el mismo arreglo: el checklist
        de salida por código quedaba mostrándose siempre (bug real, reportado en pruebas del .apk).
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

        /*
        permiteAutoDecidirJornadaAnterior queda SIN poner (false) a propósito: este es el único camino con
        pantalla propia (mi-jornada.ts) para de verdad preguntarle al trabajador "¿cerrar la de ayer o
        empezar una nueva?" cuando la jornada abierta es ambigua (ver procesarMarcacion) - el frontend reenvía
        `accion_jornada_anterior` una vez que el trabajador elige.
        */
        const { status, body } = await procesarMarcacion(
            operador,
            { actividades_ids: actividadesIdsFinal, foto_ingreso, accion_jornada_anterior },
            { omitirActividadRequerida: true }
        );
        res.status(status).json(body);
    }catch(err){
        console.error('Error procesando la marcacion con codigo.', err);
        res.status(500).json({ message: 'Error procesando la marcacion con codigo.' });
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

        /*
        Bug real (2026-09-28): a diferencia de la SALIDA normal (ver procesarMarcacion), este autoservicio
        nunca poblaba AsistenciaActividad - el trabajador podia haber cargado varias labores en el Panel de
        Actividades (RegistroActividad) durante el dia, pero al autocerrarse como SALIDA_OLVIDADA el Supervisor
        las veia como "Sin registrar" en su panel, como si no hubiera hecho nada. Mismo criterio que
        marcarConQrSesion/marcarConMiCodigo: se deriva la lista de RegistroActividad de esta jornada.
        */
        const registros = await RegistroActividad.findAll({
            where: { asistencia_id: asistencia.id },
            attributes: ['actividad_id'],
        });
        const actividadesIds = [...new Set(registros.map((r) => r.actividad_id))];
        if(actividadesIds.length > 0){
            await AsistenciaActividad.bulkCreate(
                actividadesIds.map((actividad_id) => ({ asistencia_id: asistencia.id, actividad_id }))
            );
        }

        res.json({ message: 'Tu salida quedó marcada. Tu supervisor la revisará.', asistencia });
    }catch(err){
        console.error('Error al marcar tu salida.', err);
        res.status(500).json({ message: 'Error al marcar tu salida.' });
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
        console.error('Error al generar el QR de jornada.', err);
        res.status(500).json({ message: 'Error al generar el QR de jornada.' });
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
            attributes: ['id', 'estado', 'hacienda_prestamo_id'],
        });
        const enJornada = asistenciaHoy?.estado === 'EN_JORNADA';
        res.json({
            en_jornada: enJornada,
            asistencia_id: enJornada ? asistenciaHoy!.id : null,
            /*
            "Hoy trabajas en otra hacienda" (mi-jornada.ts): si la jornada abierta ya quedo marcada como
            prestamo (por haber entrado via el QR de otra hacienda, ver marcarConQrSesion), la SALIDA tiene que
            volver a pedir el QR de esa misma hacienda prestada, nunca el codigo de SU hacienda propia - aunque
            su hacienda propia use Token. Sin esto, el frontend no tendria forma de saberlo al recargar la
            pagina (el flag en memoria de "vino por prestamo" se pierde en un refresh).
            */
            es_prestamo: enJornada ? !!asistenciaHoy!.hacienda_prestamo_id : false,
        });
    }catch(err){
        console.error('Error al consultar tu estado.', err);
        res.status(500).json({ message: 'Error al consultar tu estado.' });
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
            // Quien escanea (Supervisor/Escaner) no tiene forma de preguntarle al trabajador "¿cerrar la de
            // ayer o empezar una nueva?" a mitad del escaneo (ver ContextoMarcacion) - se decide sola.
            permiteAutoDecidirJornadaAnterior: true,
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
        console.error('Error procesando la marcacion por QR de sesion.', err);
        res.status(500).json({ message: 'Error procesando la marcacion por QR de sesion.' });
    }
};

/*
Resuelve, para una fecha puntual, el id (o los ids) de Hacienda que estan "en juego" ese dia - mismo criterio
que finalizarDia ya usa para `haciendaIdsAInvalidar` (ver ahi): la hacienda de CASA del Supervisor de cada
operador (operador.supervisor_id -> Usuario.hacienda_id), nunca hacienda_prestamo_id. Si viene supervisorId, es
solo la hacienda de ese Supervisor puntual (sin mirar si hubo marcaciones o no - "cerrado" tiene que poder
calcularse incluso antes de que exista una sola Asistencia hoy). Si no, son TODAS las haciendas con al menos un
registro hoy (acotado a quienes de verdad marcaron, igual que finalizarDia sin 'supervisor_id').
*/
const resolverHaciendasDelDia = async (fecha: string, supervisorId: number | null): Promise<number[]> => {
    if(supervisorId !== null){
        const supervisor = await Usuario.findByPk(supervisorId, { attributes: ['hacienda_id'] });
        return supervisor?.hacienda_id ? [supervisor.hacienda_id] : [];
    }
    const registros = await Asistencia.findAll({
        where: { fecha },
        include: [{ model: Operador, as: 'operador', attributes: ['supervisor_id'], required: true, paranoid: false }],
    });
    const supervisorIds = [...new Set(
        registros.map((r) => r.operador?.supervisor_id).filter((id): id is number => id != null)
    )];
    if(supervisorIds.length === 0) return [];
    const supervisores = await Usuario.findAll({
        where: { id: { [Op.in]: supervisorIds } },
        attributes: ['hacienda_id'],
    });
    return [...new Set(supervisores.map((s) => s.hacienda_id).filter((id): id is number => id != null))];
};

/*
Calcula si un DIA (una fecha puntual) ya esta "cerrado": TODAS las haciendas en juego ese dia (ver
resolverHaciendasDelDia) tienen su fila explicita en CierreJornada. Lo comparten obtenerAsistenciaHoy (el flag
`diaCerrado` que muestra, y que habilita/deshabilita "Cerrar Jornada"), revisarAsistencia y confirmarAsistencia
(que lo usan para congelar observaciones/O-X).

Antes esto se INFERIA contando Asistencias EN_JORNADA/PENDIENTE_REVISION/sin confirmar - bug real (pedido del
usuario, 2026-10-02): si el UNICO trabajador del dia se autocerraba (SALIDA_OLVIDADA, autoservicio) y el
Supervisor lo confirmaba (O), el sistema ya daba el dia por cerrado SOLO, sin que "Cerrar Jornada" se hubiera
ejecutado ni una vez - el Token seguia vivo pero el panel ya mostraba el dia congelado y el boton bloqueado.
Regla explicita del usuario: el Token (y el dia) solo pierden vigencia por vencimiento normal (24h), por un
Token nuevo, o porque "Finalizar Jornada" de verdad corrio - nunca por inferencia, ni con un solo trabajador.
Por eso ahora se consulta CierreJornada (la marca explicita que deja finalizarDia al cerrar), nunca el estado
de las Asistencias.

supervisorId opcional, mismo criterio ya establecido (ver resolverHaciendasDelDia): acota a la hacienda de ESE
Supervisor. `null` (o ADMIN sin filtro) sigue calculando sobre el dia completo.
*/
const calcularDiaCerrado = async (fecha: string, supervisorId: number | null = null): Promise<boolean> => {
    const haciendaIds = await resolverHaciendasDelDia(fecha, supervisorId);
    if(haciendaIds.length === 0) return false;
    const cerradas = await CierreJornada.count({ where: { fecha, hacienda_id: { [Op.in]: haciendaIds } } });
    return cerradas === haciendaIds.length;
};

/*
Version "por HACIENDA" de calcularDiaCerrado (arriba), usada por procesarMarcacion para bloquear nuevas
entradas (QR/Token) en una hacienda cuyo dia ya cerro de verdad. Con la marca explicita de CierreJornada esto
ya no necesita separar "propios" vs "prestados" ni resolver ningun supervisor: solo pregunta si existe la fila
para esta hacienda+fecha puntual - la misma que finalizarDia escribe al cerrar la hacienda de CASA del
Supervisor que cierra (ver haciendaIdsAInvalidar ahi, mismo criterio documentado ahi: home del Supervisor via
operador.supervisor_id, nunca hacienda_prestamo_id).
*/
const calcularDiaCerradoHacienda = async (fecha: string, haciendaId: number): Promise<boolean> => {
    return (await CierreJornada.findOne({ where: { fecha, hacienda_id: haciendaId } })) !== null;
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
        Alcance: un SUPERVISOR real SIEMPRE queda acotado a su propia hacienda (via operador.supervisor_id =
        su propio id) - ANTES esto dependia 100% de que el frontend mandara `supervisor_id` por query, algo
        que solo hace el selector de ADMIN. Un Supervisor real nunca lo manda, asi que este endpoint le
        devolvia TODOS los operadores de TODAS las haciendas mezclados, no solo los suyos - bug real de
        alcance/autorizacion (confirmado por el usuario: un Supervisor logueado con su propia cuenta veia
        marcaciones de operadores de otro Supervisor). Mismo criterio ya usado en finalizarDia (ver ahi el
        detalle): ADMIN puede acotar opcionalmente con `supervisor_id`; sin ese parametro, ADMIN sigue viendo
        todas las haciendas de una vez, a proposito - es el unico rol que de verdad supervisa el sistema
        completo.
        No afecta a calcularDiaCerrado (mas abajo) a proposito - ese indicador sigue siendo sobre el dia
        completo (todas las haciendas), independiente de este alcance. El propio cierre (finalizarDia,
        mas abajo) SI queda acotado a la hacienda del Supervisor que ejecuta el cierre (o a la que mande ADMIN
        via este mismo supervisor_id) - ver ese endpoint para el detalle.
        */
        const supervisorIdQuery = req.query['supervisor_id'];
        const supervisorIdAlcance: number | null =
            req.auth?.tipo === 'usuario' && req.auth.rol === 'SUPERVISOR'
                ? req.auth.id
                : (supervisorIdQuery ? Number(supervisorIdQuery) : null);
        const filtrarPorSupervisor = supervisorIdAlcance !== null;

        const { rows:asistencias, count:total } = await Asistencia.findAndCountAll({
            where: { fecha:hoy },
            attributes: ATRIBUTOS_SIN_FOTO,
            /*
            paranoid:false en los includes: si el Operador/Actividad de una marcacion de HOY fue eliminado
            (soft-delete) despues de que marco, el Panel de Supervisor tiene que seguir mostrando su nombre para
            poder confirmar O/X - un catalogo eliminado no debe borrar una marcacion ya hecha.

            supervisor->hacienda y haciendaPrestamo: mismo include que ya usa obtenerHistorial (ver ahi el
            detalle) - el Panel de Supervisor ahora tambien tiene su propio "Ver/Imprimir" por fila e "Imprimir
            General" (hoja-actividades-modal.ts, pedido del usuario 2026-10-02), que necesitan la hacienda de
            la jornada para el mismo encabezado que ya arma la hoja imprimible del Historial.
            */
            include: [
                {
                    model: Operador, as:'operador',
                    required: filtrarPorSupervisor,
                    paranoid: false,
                    ...(filtrarPorSupervisor ? { where: { supervisor_id: supervisorIdAlcance } } : {}),
                    include: [{
                        model: Usuario, as: 'supervisor',
                        attributes: ['hacienda_id'],
                        include: [{ model: Hacienda, as: 'hacienda', attributes: ['nombre'] }],
                    }],
                },
                { model: Actividad, as:'actividad', paranoid: false},
                { model: Actividad, as:'actividades', paranoid: false},
                { model: Hacienda, as: 'haciendaPrestamo', attributes: ['nombre'], paranoid: false },
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
        que el Supervisor haya confirmado O/X a todos). Usa el MISMO `supervisorIdAlcance` que ya acota la
        visibilidad arriba - antes este calculo ignoraba por completo ese alcance (bug real: el boton seguia
        habilitado para un Supervisor cuya propia hacienda ya estaba resuelta, solo porque OTRA hacienda tenia
        algo pendiente).
        */
       const diaCerrado = await calcularDiaCerrado(hoy, supervisorIdAlcance);

        res.json({
            data: asistencias,
            total,
            pagina:paginaActual,
            totalPaginas: Math.ceil(total / limitePagina) || 1,
            diaCerrado,
        });
    } catch(error){
        console.error('Error al obtener asustencias', error);
        res.status(500).json({ message: 'Error al obtener asustencias' });
    }
};

// Cierre de jornada ejecutando por el Supervisor
export const finalizarDia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { fecha, supervisor_id } = req.body;
        const fechaProcesar = fecha || getFetchLocalEcuador();

        /*
        Alcance del cierre: antes este endpoint no filtraba por hacienda para nada - CUALQUIER Supervisor que
        le diera a "Cerrar Jornada" cerraba el dia de TODAS las haciendas del sistema de un solo boton, aunque
        los demas supervisores no hubieran terminado de confirmar O/X a su propia gente (bug real, ver
        CLAUDE.md "Reglas de negocio confirmadas"). Un SUPERVISOR ahora SIEMPRE queda acotado a su propia
        hacienda (via operador.supervisor_id = su propio id, el mismo campo/criterio que ya usa el filtro "por
        Supervisor" del panel de ADMIN en obtenerAsistenciaHoy - no considera hacienda_prestamo_id, trabajador
        prestado, mismo criterio ya establecido ahi). ADMIN puede mandar opcionalmente `supervisor_id` para
        cerrar solo esa hacienda puntual (coincide con lo que tenga filtrado en el panel); sin ese parametro,
        ADMIN sigue cerrando todas las haciendas de una vez, a proposito - es el unico rol que de verdad
        supervisa el sistema completo.
        */
        const supervisorIdAlcance: number | null =
            req.auth?.tipo === 'usuario' && req.auth.rol === 'SUPERVISOR'
                ? req.auth.id
                : (supervisor_id ? Number(supervisor_id) : null);

        /*
        Verificamos el estado actual de la jornada antes de tocar nada: si ya queda ningun registro pendiente
        de revision, es por que el dia ya fue cerrado antes.
        */
       const registroDelDia = await Asistencia.findAll({
            where: {fecha: fechaProcesar},
            // paranoid:false: el operador pudo haber sido eliminado (soft-delete) despues de marcar hoy - su
            // nombre igual tiene que poder aparecer en "Falta confirmar la asistencia de: ..." mas abajo.
            // 'supervisor_id' agregado para poder resolver que hacienda(s) se estan cerrando mas abajo (ver
            // invalidacion del Token al cerrar).
            include: [{
                model: Operador, as: 'operador', attributes: ['nombre_completo', 'supervisor_id'], paranoid: false,
                required: supervisorIdAlcance !== null,
                ...(supervisorIdAlcance !== null ? { where: { supervisor_id: supervisorIdAlcance } } : {}),
            }],
       });
        if(registroDelDia.length === 0 ){
            res.status(404).json({
                message:`No hay marcaciones registradas para el ${fechaProcesar}.`
            });
            return;
        }

        /*
        Que hacienda(s) se estan cerrando con esta llamada - se resuelve ACA (antes de cualquier chequeo) porque
        ahora tambien lo usa el chequeo de "ya cerrada" de abajo, ademas de la invalidacion de Token que ya lo
        necesitaba (ver ese comentario mas abajo para el detalle del criterio: hacienda de CASA del Supervisor,
        via operador.supervisor_id, nunca hacienda_prestamo_id).
        */
        let haciendaIdsAInvalidar: number[];
        if (supervisorIdAlcance !== null) {
            const supervisorDelCierre = await Usuario.findByPk(supervisorIdAlcance, { attributes: ['hacienda_id'] });
            haciendaIdsAInvalidar = supervisorDelCierre?.hacienda_id ? [supervisorDelCierre.hacienda_id] : [];
        } else {
            const supervisorIdsInvolucrados = [...new Set(
                registroDelDia.map((r) => r.operador?.supervisor_id).filter((id): id is number => id != null)
            )];
            const supervisoresInvolucrados = await Usuario.findAll({
                where: { id: { [Op.in]: supervisorIdsInvolucrados } },
                attributes: ['hacienda_id'],
            });
            haciendaIdsAInvalidar = [...new Set(
                supervisoresInvolucrados.map((s) => s.hacienda_id).filter((id): id is number => id != null)
            )];
        }

        /*
        Ya cerrada: antes esto se inferia viendo si quedaba algun registro EN_JORNADA/PENDIENTE_REVISION sin
        tocar - bug real (pedido del usuario, 2026-10-02): si el UNICO trabajador del dia se autocerraba
        (SALIDA_OLVIDADA, autoservicio) y el Supervisor lo confirmaba (O) ANTES de darle a "Cerrar Jornada", ya
        no quedaba ningun registro pendiente, asi que esto decia "ya fue cerrada anteriormente" sin que el
        cierre de verdad (invalidar el Token, dejar la marca de CierreJornada) se hubiera ejecutado ni una vez.
        Ahora se pregunta por la marca EXPLICITA (CierreJornada) que esta misma funcion deja al cerrar, mas
        abajo - el dia SOLO esta cerrado si "Cerrar Jornada" de verdad corrio antes para TODAS las haciendas en
        juego ahora.
        */
        const cerradasExistentes = haciendaIdsAInvalidar.length > 0
            ? await CierreJornada.count({ where: { fecha: fechaProcesar, hacienda_id: { [Op.in]: haciendaIdsAInvalidar } } })
            : 0;
        if(haciendaIdsAInvalidar.length > 0 && cerradasExistentes === haciendaIdsAInvalidar.length){
            res.status(400).json({
                message:`La jornada del ${fechaProcesar} ya fue cerrada anteriormente.`,
                ya_cerrado : true
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

        // Los 2 UPDATE de abajo tienen que respetar el mismo alcance que ya filtramos arriba (registroDelDia) -
        // filtrar aca de nuevo por fecha+estado sin acotar por id tocaria TODAS las haciendas otra vez, aunque
        // la consulta de arriba ya se haya limitado a una sola.
        const idsDelAlcance = registroDelDia.map((r) => r.id);

        // 1.Aprobar marcaciones en PENDIENTE_REVISION -> FINALIZADO
        const [aprobados] = await Asistencia.update(
            { estado: 'FINALIZADO'},
            {
                where:{
                    id: { [Op.in]: idsDelAlcance },
                    estado: 'PENDIENTE_REVISION'
                }
            }
        );

        // 2. Marcar operadores olvidados (se quedaron en EN_JORNADA) -> SALIDA_OLVIDADA
        const [olvidados] = await Asistencia.update(
            {estado:'SALIDA_OLVIDADA'},
            {
                where:{
                    id: { [Op.in]: idsDelAlcance },
                    estado: 'EN_JORNADA'
                }
            }
        );

        /*
        Invalidar el Token de Hacienda al cerrar el dia (pedido del usuario, 2026-10-02, tras probar el hueco
        en una prueba dedicada): "Cerrar Jornada" existia pero el Token seguia vivo hasta su vencimiento normal
        (24h) - cualquiera que lo conociera podia seguir marcando entrada DESPUES de que el Supervisor ya dio
        el dia por cerrado, reabriendo el boton de cierre sin que nadie lo pidiera. Mismo alcance que el cierre
        mismo (ver haciendaIdsAInvalidar, resuelto arriba): si cerro UN Supervisor puntual (o el Admin con
        'supervisor_id'), se invalida SOLO el Token de esa hacienda; si el Admin cerro TODAS las haciendas de
        una vez (sin 'supervisor_id'), se invalidan los Tokens de las haciendas que de verdad tenian
        marcaciones en este cierre - nunca una hacienda sin ninguna actividad hoy, que ni siquiera paso por el
        filtro de arriba.

        Ademas (2026-10-02, fix de la regla de 3 disparadores) se deja la marca EXPLICITA de CierreJornada por
        cada hacienda: es la UNICA forma en que calcularDiaCerrado/calcularDiaCerradoHacienda ahora consideran
        un dia cerrado (ver esas funciones mas arriba) - findOrCreate porque el UNIQUE(hacienda_id, fecha) de la
        tabla no permite duplicar el cierre si por lo que sea esto se volviera a ejecutar para la misma hacienda.
        */
        if (haciendaIdsAInvalidar.length > 0) {
            const haciendasAInvalidar = await Hacienda.findAll({
                where: { id: { [Op.in]: haciendaIdsAInvalidar } },
                attributes: ['id', 'nombre'],
            });
            await Hacienda.update(
                { token_actual: null, token_expira_en: null },
                { where: { id: { [Op.in]: haciendaIdsAInvalidar } } },
            );
            for (const hda of haciendasAInvalidar) {
                await registrarAuditoria({
                    actorUsuarioId: req.auth!.id,
                    accion: 'INVALIDAR_TOKEN_HACIENDA',
                    objetivoTipo: 'hacienda',
                    objetivoId: hda.id,
                    objetivoNombre: hda.nombre,
                });
                await CierreJornada.findOrCreate({
                    where: { hacienda_id: hda.id, fecha: fechaProcesar },
                    defaults: { hacienda_id: hda.id, fecha: fechaProcesar, cerrado_por_usuario_id: req.auth!.id },
                });
                await registrarAuditoria({
                    actorUsuarioId: req.auth!.id,
                    accion: 'CERRAR_JORNADA',
                    objetivoTipo: 'hacienda',
                    objetivoId: hda.id,
                    objetivoNombre: hda.nombre,
                });
            }
        }

        res.json({
            message: `Jornada del ${fechaProcesar} cerrada con exito.`,
            resumen: {
                registros_finalizados: aprobados,
                salidas_olvidadas: olvidados
            }
        });

    }catch(err){
        console.error('Error al ejecutar el cierre del dia', err);
        res.status(500).json({ message: 'Error al ejecutar el cierre del dia' });
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
        El Historial de Asistencia es la auditoria OFICIAL: solo debe mostrar jornadas que el supervisor ya
        reviso y cerro (FINALIZADO/SALIDA_OLVIDADA/OBSERVANDO), nunca marcaciones todavia en curso (EN_JORNADA)
        o pendiente de revision (PENDIENTE_REVISION).

        OBSERVANDO agregado (bug real, 2026-09-28): es el estado que deja la X del Supervisor (confirmarAsistencia,
        "no presente" - ver mas abajo) - o sea, exactamente "el Supervisor ya lo revisó y decidió algo", el mismo
        criterio que ya justifica incluir FINALIZADO/SALIDA_OLVIDADA. Se había quedado afuera de este filtro por
        descuido, así que un caso OBSERVANDO (el más importante de auditar, marca una posible marcación fraudulenta)
        nunca llegaba al reporte del Panel de Asistente - el usuario lo encontró probando el flujo real completo.

        confirmado_por_supervisor no nulo: un trabajador puede autocerrar su PROPIA jornada como SALIDA_OLVIDADA
        sin que el Supervisor la haya revisado (autoservicio "no podre marcar salida", ver marcarSalidaOlvidada) -
        eso deja estado en SALIDA_OLVIDADA de inmediato, sin pasar por finalizarDia, que es quien normalmente
        exige el O/X del Supervisor antes de cerrar el dia. Sin este filtro, esa jornada aparecia en el Historial
        apenas el trabajador se autocerraba, como si fuera "en tiempo real" - antes de que el Supervisor hiciera
        su revision o cerrara el dia. Se exige la misma condicion que finalizarDia ya exige (confirmado_por_supervisor
        !== null) para que el Historial nunca muestre nada que el Supervisor no haya revisado todavia.
        */
        whereCondition.estado = { [Op.in] : ['FINALIZADO','SALIDA_OLVIDADA','OBSERVANDO']};
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
                    /*
                    attributes:['hacienda_id'] (antes []): la hoja imprimible (Ver/Imprimir, asistencia-panel.ts)
                    necesita mostrar en QUE hacienda se hizo la jornada en vez del codigo_megued (que ya se
                    repite en el carnet/QR) - hacienda_id es la hacienda PERMANENTE del trabajador via su
                    Supervisor. Se anida Hacienda para traer el nombre en la misma consulta.
                    */
                    include: [{
                        model: Usuario, as: 'supervisor',
                        attributes: ['hacienda_id'],
                        ...(filtrarPorHacienda ? { where: { hacienda_id: Number(hacienda_id) } } : {}),
                        include: [{ model: Hacienda, as: 'hacienda', attributes: ['nombre'] }],
                    }],
                },
                { model: Actividad, as: 'actividad', paranoid: false },
                { model: Actividad, as: 'actividades', paranoid: false },
                /*
                haciendaPrestamo: cuando la jornada fue de un trabajador PRESTADO (ver hacienda_prestamo_id),
                la hoja imprimible debe mostrar la hacienda donde REALMENTE trabajó ese día, no su hacienda
                permanente - el frontend prioriza esta sobre operador.supervisor.hacienda (ver asistencia-panel.ts).
                */
                { model: Hacienda, as: 'haciendaPrestamo', attributes: ['nombre'], paranoid: false },
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
        console.error('Error al consultar el historial del asistencia', err);
        res.status(500).json({ message: 'Error al consultar el historial del asistencia' });
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
            attributes: ['id', 'foto_ingreso', 'foto_r2_key', 'hacienda_prestamo_id'],
            include: [{ model: Operador, as: 'operador', attributes: ['supervisor_id'], paranoid: false }],
        });
        if(!asistencia){
            res.status(404).json({ message: 'Registro de asistencia no encontrado.'});
            return;
        }

        if(!tienePermisoSupervisorSobreAsistencia(asistencia, req.auth)){
            res.status(403).json({ message: 'No tienes permiso para ver esta evidencia.' });
            return;
        }

        if(!asistencia.foto_ingreso && !asistencia.foto_r2_key){
            res.status(404).json({ message: 'Este registro no tiene foto de evidencia.'});
            return;
        }

        // Prioridad a R2 (foto nueva) - foto_ingreso queda como respaldo de registros viejos o de una
        // subida a R2 que fallo en su momento (ver prepararFotoParaGuardar).
        const fotoIngreso = asistencia.foto_r2_key
            ? await obtenerFotoBase64(asistencia.foto_r2_key)
            : asistencia.foto_ingreso;

        res.json({ foto_ingreso: fotoIngreso });

    } catch(err){
        console.error('Error al obtener la foto de evidencia.', err);
        res.status(500).json({ message: 'Error al obtener la foto de evidencia.' });
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
        console.error('Error al admitir al trabajador externo.', err);
        res.status(500).json({ message: 'Error al admitir al trabajador externo.' });

    }
};

/*
Reseteo de clave del Operador(Mecanico/Operador):quien lo resetea fija una nueva, nunca puede ver la anterior (el hash no es 
reversible). Requiere JWT con rol ADMIN o ASISTIENTE.
*/
export const resetearClaveOperador = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        // Recortar espacios al inicio/final ANTES de guardar - ver auth.controller.ts (login), mismo motivo.
        const clave = typeof req.body.clave === 'string' ? req.body.clave.trim() : req.body.clave;

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
        console.error('Error al resetear la clave del operador.', error);
        res.status(500).json({ message: 'Error al resetear la clave del operador.' });

    }
};

//Edicion/Revision por parte del Supervisor(Ajustes de hora, estado u observacciones)
export const revisarAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{

        const { id } = req.params;
        const { hora_salida, observaciones, estado, actividad_id } = req.body;

        const asistencia = await Asistencia.findByPk(Number(id), {
            include: [{ model: Operador, as: 'operador', attributes: ['supervisor_id'], paranoid: false }],
        });
        if(!asistencia){
            res.status(404).json({ message: "Registro de asistencia no encontrado."});
            return;
        }

        // Ver tienePermisoSupervisorSobreAsistencia arriba para el detalle - antes cualquier Supervisor podia
        // editar la observacion/hora_salida/estado de CUALQUIER operador del sistema con solo conocer el id.
        if(!tienePermisoSupervisorSobreAsistencia(asistencia, req.auth)){
            res.status(403).json({ message: 'No tienes permiso para modificar este registro.' });
            return;
        }

        /*
        Datos congelados: pero a nivel de DIA completo (ver calcularDiaCerrado), no de este registro puntual - un
        trabajador puede autocerrarse (SALIDA_OLVIDADA) mucho antes de que el Supervisor termine de confirmar O/X
        a los demas, y eso no debe congelar SU observacion mientras el dia sigue abierto para el resto. Acotado a
        la propia hacienda del Supervisor que pide la edicion (mismo bug que obtenerAsistenciaHoy: antes esto
        calculaba sobre TODAS las haciendas, asi que la observacion de un Supervisor quedaba (des)congelada
        segun lo que pasara en una hacienda ajena, no la suya).
        */
       const supervisorIdParaCierre = req.auth?.tipo === 'usuario' && req.auth.rol === 'SUPERVISOR' ? req.auth.id : null;
       if(await calcularDiaCerrado(asistencia.fecha, supervisorIdParaCierre)){
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
        console.error("Error al revisar la asistencia.", err);
        res.status(500).json({ message: "Error al revisar la asistencia." });

    }
}

/*
O/X del Supervisor: al lado de cada trabajador que le aparece logueado hoy en su panel, el Supervisor confirma si
de verdad vino. presente=true (O) solo deja la marca de confirmado. presente=false (X) ademas mueve el estado a
OBSERVANDO y genera una observacion automatica, para que quede visible en Auditoria (Panel de Asistente) por que
esa jornada no cuenta como valida. Requiere JWT con rol SUPERVISOR o ADMIN (ver ruta).

NO se bloquea por el `estado` de ESE registro puntual (FINALIZADO/SALIDA_OLVIDADA) - el trabajador puede haber
marcado su propia salida, o autocerrado, mucho antes de que el Supervisor termine de revisar a todos, y eso no
debe impedirle decir "esto no fue real" mientras el DIA sigue abierto (mismo criterio que revisarAsistencia).

SI se bloquea una vez que el DIA COMPLETO de esa hacienda ya se cerro con "Cerrar Jornada" (ver
calcularDiaCerrado) - antes esto quedaba deliberadamente sin congelar ni siquiera ahi (para poder corregir un
fraude de Token de Hacienda detectado tarde), pero el usuario decidio que "Cerrar Jornada" tiene que congelar
TODO sin excepcion, ya que ese reporte pasa al Panel de Asistente apenas se cierra - un cambio de O/X despues
de eso deja al Asistente con datos que ya cambiaron sin ningun aviso (confirmado en pruebas reales: las
observaciones automaticas de cada X se iban acumulando sin limite en el mismo campo). Si se detecta un fraude
despues de cerrado, hoy no hay forma de corregirlo desde este endpoint - queda fuera de alcance por decision
explicita del usuario, se maneja aparte si llega a pasar.
*/
export const confirmarAsistencia = async(req:Request, res:Response):Promise<void> => {
    try{
        const { id } = req.params;
        const { presente } = req.body;

        if(typeof presente !== 'boolean'){
            res.status(400).json({ message: 'presente es obligatorio y debe ser true (O) o false (X).'});
            return;
        }

        const asistencia = await Asistencia.findByPk(Number(id), {
            include: [{ model: Operador, as: 'operador', attributes: ['supervisor_id'], paranoid: false }],
        });
        if(!asistencia){
            res.status(404).json({ message: 'Registro de asistencia no encontrado.'});
            return;
        }

        // Ver tienePermisoSupervisorSobreAsistencia arriba para el detalle - un SUPERVISOR real solo confirma
        // O/X de sus propios operadores (o de un trabajador prestado que el mismo admitió hoy).
        if(!tienePermisoSupervisorSobreAsistencia(asistencia, req.auth)){
            res.status(403).json({ message: 'No tienes permiso para confirmar este registro.' });
            return;
        }

        // Congelado una vez que "Cerrar Jornada" cerro el DIA completo de esa hacienda (ver comentario de la
        // funcion arriba) - mismo alcance por hacienda que revisarAsistencia.
        const supervisorIdParaCierre = req.auth?.tipo === 'usuario' && req.auth.rol === 'SUPERVISOR' ? req.auth.id : null;
        if(await calcularDiaCerrado(asistencia.fecha, supervisorIdParaCierre)){
            res.status(400).json({ message: 'La jornada de este día ya fue cerrada y no se puede modificar.' });
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
        console.error('Error al confirmar la asistencia.', err);
        res.status(500).json({ message: 'Error al confirmar la asistencia.' });
    }
};