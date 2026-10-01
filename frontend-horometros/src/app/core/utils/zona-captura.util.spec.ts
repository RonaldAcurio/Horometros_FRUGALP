import {
    puntoDentroDeZonaActiva,
    resultadoDentroDeZonaActiva,
    dimensionesRedimensionadas,
    ZONA_ACTIVA_PORCENTAJE,
    FOTO_EVIDENCIA_LADO_MAXIMO,
} from './zona-captura.util';

describe('puntoDentroDeZonaActiva', () => {
    // Video de 1000x1000 con el 70% por defecto -> margen de 150px a cada lado, zona activa de 150 a 850.
    const ANCHO = 1000;
    const ALTO = 1000;

    it('el centro exacto siempre esta dentro', () => {
        expect(puntoDentroDeZonaActiva(500, 500, ANCHO, ALTO)).toBe(true);
    });

    it('un punto justo en el borde interior de la zona esta dentro (inclusivo)', () => {
        expect(puntoDentroDeZonaActiva(150, 150, ANCHO, ALTO)).toBe(true);
        expect(puntoDentroDeZonaActiva(850, 850, ANCHO, ALTO)).toBe(true);
    });

    it('un punto justo afuera del borde esta fuera', () => {
        expect(puntoDentroDeZonaActiva(149, 500, ANCHO, ALTO)).toBe(false);
        expect(puntoDentroDeZonaActiva(851, 500, ANCHO, ALTO)).toBe(false);
        expect(puntoDentroDeZonaActiva(500, 149, ANCHO, ALTO)).toBe(false);
        expect(puntoDentroDeZonaActiva(500, 851, ANCHO, ALTO)).toBe(false);
    });

    it('una esquina del video completo (0,0) esta fuera', () => {
        expect(puntoDentroDeZonaActiva(0, 0, ANCHO, ALTO)).toBe(false);
    });

    it('respeta un porcentaje distinto al default', () => {
        // 50% de 1000 = zona de 250 a 750.
        expect(puntoDentroDeZonaActiva(300, 300, ANCHO, ALTO, 0.5)).toBe(true);
        expect(puntoDentroDeZonaActiva(200, 200, ANCHO, ALTO, 0.5)).toBe(false);
    });

    it('con ancho o alto en 0 (video no listo) siempre devuelve false, nunca true por accidente', () => {
        expect(puntoDentroDeZonaActiva(0, 0, 0, 0)).toBe(false);
        expect(puntoDentroDeZonaActiva(5, 5, 0, 100)).toBe(false);
    });

    it('el porcentaje por defecto exportado es 0.7 (documentado para quien lea el codigo)', () => {
        expect(ZONA_ACTIVA_PORCENTAJE).toBe(0.7);
    });
});

describe('resultadoDentroDeZonaActiva', () => {
    const ANCHO = 1000;
    const ALTO = 1000;
    const punto = (x: number, y: number) => ({ getX: () => x, getY: () => y });

    it('acepta un QR con las 3 esquinas tipicas de ZXing, todas dentro de la zona', () => {
        const puntos = [punto(300, 300), punto(300, 700), punto(700, 300)];
        expect(resultadoDentroDeZonaActiva(puntos, ANCHO, ALTO)).toBe(true);
    });

    it('rechaza si UNA sola esquina cae afuera, aunque las demas esten adentro', () => {
        const puntos = [punto(300, 300), punto(300, 700), punto(50, 50)];
        expect(resultadoDentroDeZonaActiva(puntos, ANCHO, ALTO)).toBe(false);
    });

    it('rechaza un QR completamente fuera de la zona (ej. en una esquina del video)', () => {
        const puntos = [punto(10, 10), punto(10, 50), punto(50, 10)];
        expect(resultadoDentroDeZonaActiva(puntos, ANCHO, ALTO)).toBe(false);
    });

    it('rechaza sin puntos, null o arreglo vacio - nunca acepta "por las dudas"', () => {
        expect(resultadoDentroDeZonaActiva([], ANCHO, ALTO)).toBe(false);
        expect(resultadoDentroDeZonaActiva(null, ANCHO, ALTO)).toBe(false);
        expect(resultadoDentroDeZonaActiva(undefined, ANCHO, ALTO)).toBe(false);
    });
});

describe('dimensionesRedimensionadas', () => {
    it('achica una foto horizontal grande respetando la proporcion', () => {
        // 1920x1080 -> el lado mas largo (1920) baja a 640, el otro baja en la misma proporcion.
        const r = dimensionesRedimensionadas(1920, 1080, 640);
        expect(r.width).toBe(640);
        expect(r.height).toBe(360); // 1080 * (640/1920) = 360
    });

    it('achica una foto vertical (celular en modo retrato) por el lado mas largo, que es el alto', () => {
        const r = dimensionesRedimensionadas(1080, 1920, 640);
        expect(r.height).toBe(640);
        expect(r.width).toBe(360);
    });

    it('no agranda una foto que ya es mas chica que el limite', () => {
        const r = dimensionesRedimensionadas(320, 240, 640);
        expect(r).toEqual({ width: 320, height: 240 });
    });

    it('una foto cuyo lado mas largo es EXACTAMENTE el limite queda igual', () => {
        const r = dimensionesRedimensionadas(640, 480, 640);
        expect(r).toEqual({ width: 640, height: 480 });
    });

    it('usa el limite por defecto (640) exportado cuando no se pasa ladoMaximo', () => {
        const r = dimensionesRedimensionadas(1280, 720);
        expect(Math.max(r.width, r.height)).toBe(FOTO_EVIDENCIA_LADO_MAXIMO);
    });
});
