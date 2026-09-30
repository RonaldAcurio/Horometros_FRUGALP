import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/*
Cloudflare R2 es compatible con la API de S3 (ver CLAUDE.md) - por eso usamos el SDK oficial de AWS apuntando
al endpoint de R2 en vez de un SDK propio de Cloudflare. Las 4 variables son obligatorias en produccion: sin
ellas, subirFoto/obtenerFotoBase64 fallan explicito en vez de guardar la foto en un lugar incorrecto o silencioso.
*/
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'frugalp-fotos';

const r2Configurado = !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

const cliente = r2Configurado
    ? new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID!,
            secretAccessKey: R2_SECRET_ACCESS_KEY!,
        },
    })
    : null;

export const r2EstaConfigurado = (): boolean => r2Configurado;

/*
Las fotos llegan del frontend como Data URI ('data:image/jpeg;base64,/9j/4AAQ...') - separamos el content-type
real del contenido para subir el binario puro a R2 (no el string base64 completo, que pesaria ~33% mas).
*/
const parsearDataUri = (dataUri: string): { contentType: string; buffer: Buffer } => {
    const match = dataUri.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error('Formato de foto invalido: se esperaba un Data URI base64.');
    }
    return { contentType: match[1]!, buffer: Buffer.from(match[2]!, 'base64') };
};

export const subirFoto = async (dataUri: string, key: string): Promise<void> => {
    if (!cliente) {
        throw new Error('R2 no esta configurado (faltan variables de entorno R2_*).');
    }
    const { contentType, buffer } = parsearDataUri(dataUri);
    await cliente.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
};

/*
Devuelve la foto como el mismo Data URI que el frontend ya espera (ver obtenerFotoAsistencia) - asi el
contrato de la API no cambia, solo cambia DE DONDE sale el contenido. El content-type original se preserva
porque se guardo tal cual en subirFoto.
*/
export const obtenerFotoBase64 = async (key: string): Promise<string> => {
    if (!cliente) {
        throw new Error('R2 no esta configurado (faltan variables de entorno R2_*).');
    }
    const respuesta = await cliente.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    const bytes = await respuesta.Body!.transformToByteArray();
    const contentType = respuesta.ContentType || 'image/jpeg';
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
};
