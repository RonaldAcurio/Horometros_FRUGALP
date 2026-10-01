/*
Utilidades puras (sin DOM, sin camara) para dos cosas del escaneo de QR con evidencia (marcacion-kiosco,
escaneo-sesion - ver sus componentes): la "zona activa" donde SI se acepta un QR leido, y el redimensionado de
la foto de evidencia antes de subirla a R2. Separadas en funciones puras para poder probarlas con pruebas
unitarias normales, sin necesitar una camara real ni un video.

Diseño pedido por el usuario (2026-09-30): el video se ve completo en pantalla, pero visualmente se marca un
recuadro central (la "zona activa", ZONA_ACTIVA_PORCENTAJE de ancho/alto) - un QR solo se acepta si cae DENTRO
de ese recuadro (evita escanear sin querer el carnet de otra persona que quede de fondo). La FOTO de evidencia,
en cambio, se sigue capturando del video COMPLETO (no recortada a la zona activa) - el margen de afuera del
recuadro existe justamente para que esa foto capture mas contexto/rostro de quien esta escaneando.
*/

// Centrado: deja un margen de (1 - ZONA_ACTIVA_PORCENTAJE) / 2 a cada lado. 0.7 = recuadro del 70% del ancho y
// alto del video, con un margen del 15% a cada lado.
export const ZONA_ACTIVA_PORCENTAJE = 0.7;

// Lado mas largo de la foto de evidencia subida a R2, en pixeles - ver capturarFotoEvidencia() en los
// componentes. 640px es suficiente para reconocer una cara con claridad y pesa poco (~50-150KB en JPEG).
export const FOTO_EVIDENCIA_LADO_MAXIMO = 640;

export interface PuntoResultado {
    getX(): number;
    getY(): number;
}

/*
True si (x,y) - en el mismo espacio de pixeles que anchoVideo/altoVideo (ej. videoElement.videoWidth/Height) -
cae dentro del recuadro central de 'porcentaje' de ancho y alto.
*/
export const puntoDentroDeZonaActiva = (
    x: number,
    y: number,
    anchoVideo: number,
    altoVideo: number,
    porcentaje: number = ZONA_ACTIVA_PORCENTAJE,
): boolean => {
    if (anchoVideo <= 0 || altoVideo <= 0) return false;
    // Redondeado: los pixeles son enteros, y sin esto '1 - 0.7' (0.30000000000000004 en punto flotante) corre
    // el borde una fraccion de pixel y hace fallar una comparacion que deberia ser exacta en el borde.
    const margenX = Math.round((anchoVideo * (1 - porcentaje)) / 2);
    const margenY = Math.round((altoVideo * (1 - porcentaje)) / 2);
    return x >= margenX && x <= anchoVideo - margenX && y >= margenY && y <= altoVideo - margenY;
};

/*
True solo si TODOS los puntos del resultado (las esquinas/patrones que detecto ZXing) caen dentro de la zona
activa - mas estricto que solo el centro, asi un QR que apenas asoma por el borde del recuadro NO se acepta.
Un resultado sin puntos (debería no pasar con ZXing, pero por si acaso) se rechaza por seguridad.
*/
export const resultadoDentroDeZonaActiva = (
    puntosResultado: PuntoResultado[] | null | undefined,
    anchoVideo: number,
    altoVideo: number,
    porcentaje: number = ZONA_ACTIVA_PORCENTAJE,
): boolean => {
    if (!puntosResultado || puntosResultado.length === 0) return false;
    return puntosResultado.every((p) => puntoDentroDeZonaActiva(p.getX(), p.getY(), anchoVideo, altoVideo, porcentaje));
};

/*
Calcula a que dimensiones dibujar el canvas de la foto de evidencia para que el lado mas largo no pase de
'ladoMaximo', conservando la proporcion original (sin estirar ni recortar nada) - si la imagen ya es mas chica
que el limite, se deja igual (nunca se agranda).
*/
export const dimensionesRedimensionadas = (
    anchoOriginal: number,
    altoOriginal: number,
    ladoMaximo: number = FOTO_EVIDENCIA_LADO_MAXIMO,
): { width: number; height: number } => {
    const ladoMasLargo = Math.max(anchoOriginal, altoOriginal);
    if (ladoMasLargo <= ladoMaximo || ladoMasLargo === 0) {
        return { width: anchoOriginal, height: altoOriginal };
    }
    const escala = ladoMaximo / ladoMasLargo;
    return { width: Math.round(anchoOriginal * escala), height: Math.round(altoOriginal * escala) };
};
