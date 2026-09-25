import jwt from 'jsonwebtoken';

/*
JWT de sesion: stateless, no se guarda en ninguna tabla(ver CLAUDE.md, seccion "dos token que NO son los mismo -
esto no es el Token de Hacienda"). La firma la verifica jwt.verify() contra JWT_SECRET: si el secreto no esta confirgurado, fallamos
fuerte al arrancar en vez de correr con un valor por defecto inseguro.
*/

const JWT_SECRET = process.env.JWT_SECRET;
if(!JWT_SECRET){
    throw new Error('Falta configurar JWT_SECRET en las variables de entorno.');
}

// 8 horas: cubre una jornada laboral completa sin dejar sesione abiertas indefinidamente.
const JWT_EXPIRA_EN = '8h';

export type TipoCuenta = 'usuario' | 'operador';

export interface PayloadToken {
    id: number;
    tipo: TipoCuenta;
    /*
    para 'usuario': ADMIN | ASISTENTE | SUPERVISOR (viene de Usuario.cargo)
    para 'operador': MECANICO | OPERADOR (viene de Operador.rol)
    */
   rol:string;
   hacienda_id: number | null;
   // No lo mandamos nosotros: jsonwebtoken lo agrega solo al firmar (segundos desde epoch). Presente siempre
   // que verificarToken() tiene exito - usado para revocacion de sesiones (ver utils/sesion-revocada.ts).
   iat?: number;
}

export const generarToken = (payload:PayloadToken):string => {
    return jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRA_EN});
}

export const verificarToken = (token:string):PayloadToken => {
    return jwt.verify(token, JWT_SECRET as string) as PayloadToken;
}

/*
QR de jornada (Camino B, "el trabajador ya logueado muestra su propio QR flotante para que alguien mas lo escanee"):
NO es el mismo token de sesion de arriba. Es un JWT aparte, de vida muy corta (90s), que el frontend vuelve a pedir
y a redibujar en bucle mientras el QR esta en pantalla. Por que asi evitamos el reuso: una foto/captura de pantalla de
este QR deja de servir en menos de 2 minutos, a diferencia de un operador_id fijo que serviria para siempre.
*/
const QR_JORNADA_VIGENCIA = '90s';

export interface PayloadQrJornada {
    operador_id: number;
    tipo: 'qr_jornada';
}

export const generarTokenQrJornada = (operador_id:number):string => {
    const payload: PayloadQrJornada = { operador_id, tipo: 'qr_jornada' };
    return jwt.sign(payload, JWT_SECRET as string, { expiresIn: QR_JORNADA_VIGENCIA });
}

export const verificarTokenQrJornada = (token:string):PayloadQrJornada => {
    const payload = jwt.verify(token, JWT_SECRET as string) as PayloadQrJornada;
    if(payload.tipo !== 'qr_jornada'){
        throw new Error('El token no es un QR de jornada valido.');
    }
    return payload;
}