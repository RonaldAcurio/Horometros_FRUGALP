import crypto from 'crypto';

/*
Cifrado en reposo de PII sensible del Operador (cedula, telefono, direccion - ver CLAUDE.md, "Cifrado de datos
sensibles"). AES-256-GCM: cifrado autenticado, si alguien altera el texto cifrado (o usa la clave equivocada) el
descifrado falla en vez de devolver basura silenciosamente.

CIFRADO_CLAVE es OBLIGATORIA (32 bytes en hex = 64 caracteres) - igual que JWT_SECRET (ver jwt.service.ts), si
falta el proceso no arranca en vez de correr con una clave insegura por defecto. Generarla con:
  openssl rand -hex 32
Si esta clave se pierde, los datos cifrados quedan IRRECUPERABLES para siempre - no hay forma de "resetearla"
sin perder todo lo que ya esta cifrado con la anterior.
*/
const CIFRADO_CLAVE = process.env.CIFRADO_CLAVE;
if(!CIFRADO_CLAVE || CIFRADO_CLAVE.length !== 64){
    throw new Error('Falta configurar CIFRADO_CLAVE en las variables de entorno (32 bytes en hex, 64 caracteres - generar con: openssl rand -hex 32).');
}
const CLAVE = Buffer.from(CIFRADO_CLAVE, 'hex');

const ALGORITMO = 'aes-256-gcm';
// Distingue un valor cifrado por este modulo de un valor legado (de antes de activar el cifrado) que todavia
// esta en texto plano en la BD - descifrar() devuelve estos ultimos tal cual, sin intentar descifrarlos.
const PREFIJO = 'enc1:';

const empaquetar = (iv: Buffer, authTag: Buffer, cifrado: Buffer): string => {
    return PREFIJO + Buffer.concat([iv, authTag, cifrado]).toString('base64');
};

/*
Cifrado NO determinístico (IV aleatorio de 12 bytes por llamada): para campos que nunca se buscan por igualdad
exacta (telefono, direccion). El mismo texto da un resultado distinto cada vez que se cifra - mas seguro, pero
no sirve para columnas con UNIQUE ni para "WHERE campo = valor" (ver cifrarDeterministico).
*/
export const cifrar = (texto: string | null | undefined): string | null => {
    if(texto === null || texto === undefined || texto === '') return texto ?? null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITMO, CLAVE, iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return empaquetar(iv, cipher.getAuthTag(), cifrado);
};

/*
Cifrado determinístico (mismo texto de entrada -> siempre el mismo resultado): SOLO para 'cedula', que tiene una
restriccion UNIQUE en la BD y se busca por igualdad exacta (verificarDuplicadosOperador, asistencia.controller.ts).
El IV no es aleatorio: se deriva del propio texto + la clave via HMAC-SHA256 (truncado a 12 bytes) - asi el
UNIQUE index de Postgres sobre la columna sigue funcionando sin tocarlo, y para buscar por igualdad alcanza con
cifrar el valor buscado de la misma forma, sin tener que descifrar toda la tabla fila por fila.

Contrapartida aceptada: dos filas con la MISMA cedula (no deberia pasar, es justamente lo que el UNIQUE evita)
tendrian el mismo texto cifrado - exactamente lo que la restriccion UNIQUE ya necesita poder detectar.
*/
export const cifrarDeterministico = (texto: string | null | undefined): string | null => {
    if(texto === null || texto === undefined || texto === '') return texto ?? null;
    const iv = crypto.createHmac('sha256', CLAVE).update(texto).digest().subarray(0, 12);
    const cipher = crypto.createCipheriv(ALGORITMO, CLAVE, iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return empaquetar(iv, cipher.getAuthTag(), cifrado);
};

// Sirve para descifrar CUALQUIERA de los dos formatos de arriba (el IV va embebido en el propio paquete, a
// quien descifra no le importa como se genero). Un valor legado sin el prefijo 'enc1:' se devuelve tal cual.
export const descifrar = (valor: string | null | undefined): string | null => {
    if(valor === null || valor === undefined || valor === '') return valor ?? null;
    if(!valor.startsWith(PREFIJO)) return valor; // valor legado, todavia en texto plano
    const datos = Buffer.from(valor.slice(PREFIJO.length), 'base64');
    const iv = datos.subarray(0, 12);
    const authTag = datos.subarray(12, 28);
    const cifrado = datos.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITMO, CLAVE, iv);
    decipher.setAuthTag(authTag);
    const descifrado = Buffer.concat([decipher.update(cifrado), decipher.final()]);
    return descifrado.toString('utf8');
};
