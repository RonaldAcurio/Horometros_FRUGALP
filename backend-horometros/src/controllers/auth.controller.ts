import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Usuario } from '../models/usuario';
import { Operador } from '../models/operador';
import { Asistencia } from '../models/asistencias';
import { Hacienda } from '../models/hacienda';
import { generarToken } from '../services/jwt.service';

const getFechaLocalEcuador = ():string => {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guayaquil' });
};

/*
Estados que significan "hoy ya no hay nada mas que hacer para este trabajador": ya marco su salida (PENDIENTE_REVISION),
el supervisor ya cerro el dia (FINALIZADO/SALIDA_OLVIDADA), o el supervisor lo marco como NO presente (OBSERVANDO,
ver confirmarAsistencia). En cualquiera de estos casos NO se emite un token nuevo: esto es lo que evita que alguien
vuelva a loguearse el mismo dia para "cubrir" a un companero que ya se fue o que nunca llego.
*/
const ESTADOS_JORNADA_CERRADA = ['PENDIENTE_REVISION', 'FINALIZADO', 'SALIDA_OLVIDADA', 'OBSERVANDO'];

/*
Login unico (pantalla unica ver en el frontend, en CLAUDE.md): un mismo usuario no puede existit a la vez en 'usuarios' Y en 'operadores' (se valida al crear
cada cuenta, no aqui), asi que primero busca en una tabla y luego en otra nuca es ambiguo.
*/
export const login = async(req: Request, res: Response):Promise<void> => {
    try{
        const {usuario, clave} = req.body;
        if(!usuario || !clave){
            res.status(400).json({ message:'Usuario y clave con obligatorios.'});
            return;
        }

        //1. Buscar en 'usuarios'(ADMIN/ASISTENTE/SUPERVISOR/ESCANER)
        const cuentaUsuario = await Usuario.findOne({ where:{ usuario }});
        if(cuentaUsuario){
            if(!cuentaUsuario.activo){
                res.status(403).json({ message:'Esta ceunta esta desactivada.'});
                return;
            }
            const claveValida = await bcrypt.compare(clave, cuentaUsuario.clave_hash);
            if(!claveValida){
                res.status(401).json({ message:'Usuario o clave incorrectos.'});
                return;
            }

            const token =generarToken({
                id: cuentaUsuario.id,
                tipo: 'usuario',
                rol: cuentaUsuario.cargo,
                hacienda_id: cuentaUsuario.hacienda_id,
            });

            /*
            Para SUPERVISOR/ESCANER mandamos tambien el nombre de la hacienda: el login NUNCA deja elegirla (viene fija
            desde que el Admin creo la cuenta), esto es solo para que el front la MUESTRE como confirmacion visual
            ("estas operando en Santa Clara") y así el usuario se de cuenta de inmediato si algo no cuadra.
            */
            let haciendaNombre: string | null = null;
            if(cuentaUsuario.hacienda_id){
                const hacienda = await Hacienda.findByPk(cuentaUsuario.hacienda_id);
                haciendaNombre = hacienda?.nombre ?? null;
            }

            res.json({
                token,
                perfil:{
                    id: cuentaUsuario.id,
                    nombre_completo: cuentaUsuario.nombre_completo,
                    rol: cuentaUsuario.cargo,
                    hacienda_id: cuentaUsuario.hacienda_id,
                    hacienda_nombre: haciendaNombre,
                },
            });
            return;
        }

        //2. No estaba e 'usuarios' -> buscar en 'operadores' (Mecanico/Operador)
        const cuentaOperador = await Operador.findOne({ where:{ usuario }});
        if(cuentaOperador && cuentaOperador.clave_hash){
            const claveValido = await bcrypt.compare(clave, cuentaOperador.clave_hash);
            if(!claveValido){
                res.status(401).json({ message:'Usuario o clave incorrectos.'});
                return;
            }

            /*
            La sesion del Operador/Mecanico no dura 8h fijas: dura lo que dure su jornada. Si hoy ya marco salida,
            o el Supervisor ya cerro el dia, o el Supervisor lo marco como NO presente, no le damos un token nuevo -
            asi evitamos que sus credenciales "cubran" a un companero que ya se fue o que nunca llego.
            */
            const hoyLogin = getFechaLocalEcuador();
            const asistenciaHoy = await Asistencia.findOne({
                where: { operador_id: cuentaOperador.id, fecha: hoyLogin },
            });
            if(asistenciaHoy && ESTADOS_JORNADA_CERRADA.includes(asistenciaHoy.estado)){
                res.status(403).json({
                    message: 'Tu jornada de hoy ya fue cerrada. Si esto es un error, contacta a tu supervisor.',
                });
                return;
            }

            //la hacienda del Operador la resuelve su SUPERVISOR (no tiene hacienda_id propio).
            let haciendaId: number | null=null;
            if(cuentaOperador.supervisor_id){
                const supervisor = await Usuario.findByPk(cuentaOperador.supervisor_id);
                haciendaId = supervisor?.hacienda_id ?? null;
            }

            const token = generarToken({
                id: cuentaOperador.id,
                tipo: 'operador',
                rol: cuentaOperador.rol || 'MECANICO',
                hacienda_id: haciendaId,
            });

            res.json({
                token,
                perfil:{
                    id: cuentaOperador.id,
                    nombre_completo: cuentaOperador.nombre_completo,
                    rol: cuentaOperador.rol,
                    hacienda_id: haciendaId,
                },
            });
            return;
        }

        //No se encontro en ninguna de las dos tablas
        res.status(401).json({ message:'Usuario o clave incorrectos.'});

    }catch(err){
        res.status(500).json({ message:'Error al iniciar sesion.', err});

    }
}