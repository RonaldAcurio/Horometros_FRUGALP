import { describe, it, expect } from 'vitest';
import { cifrar, cifrarDeterministico, descifrar } from './cifrado';

describe('cifrar / descifrar', () => {
    it('cifra y descifra de vuelta al mismo texto', () => {
        const original = '0987654321';
        const cifrado = cifrar(original);
        expect(cifrado).not.toBe(original);
        expect(descifrar(cifrado)).toBe(original);
    });

    it('el mismo texto da un resultado DISTINTO cada vez (no determinístico)', () => {
        const original = 'Calle Falsa 123';
        expect(cifrar(original)).not.toBe(cifrar(original));
    });

    it('null/undefined/"" pasan tal cual, sin intentar cifrar', () => {
        expect(cifrar(null)).toBe(null);
        expect(cifrar(undefined)).toBe(null);
        expect(cifrar('')).toBe('');
    });

    it('un valor legado (texto plano, sin el prefijo de cifrado) se devuelve tal cual al "descifrar"', () => {
        expect(descifrar('0987654321')).toBe('0987654321');
    });
});

describe('cifrarDeterministico', () => {
    it('el mismo texto SIEMPRE da el mismo resultado (a diferencia de cifrar())', () => {
        const cedula = '1712345678';
        const a = cifrarDeterministico(cedula);
        const b = cifrarDeterministico(cedula);
        expect(a).toBe(b);
    });

    it('textos distintos dan resultados distintos', () => {
        expect(cifrarDeterministico('1712345678')).not.toBe(cifrarDeterministico('1798765432'));
    });

    it('sigue siendo descifrable con la funcion generica descifrar()', () => {
        const cedula = '1712345678';
        expect(descifrar(cifrarDeterministico(cedula))).toBe(cedula);
    });

    it('null/undefined/"" pasan tal cual', () => {
        expect(cifrarDeterministico(null)).toBe(null);
        expect(cifrarDeterministico(undefined)).toBe(null);
        expect(cifrarDeterministico('')).toBe('');
    });
});
