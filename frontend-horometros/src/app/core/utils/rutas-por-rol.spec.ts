import { rutaHomePorRol } from './rutas-por-rol';
import { PerfilCuenta } from '../models/auth.model';

const perfilCon = (rol: PerfilCuenta['rol']): PerfilCuenta => ({
  id: 1,
  nombre_completo: 'Test',
  rol,
  hacienda_id: null,
  terminos_aceptados: true,
});

describe('rutaHomePorRol', () => {
  it('manda a ESCANER a su pantalla dedicada de un solo boton', () => {
    expect(rutaHomePorRol(perfilCon('ESCANER'))).toBe('/escaner');
  });

  it('manda a MECANICO y OPERADOR a su pantalla cautiva de jornada', () => {
    expect(rutaHomePorRol(perfilCon('MECANICO'))).toBe('/mi-jornada');
    expect(rutaHomePorRol(perfilCon('OPERADOR'))).toBe('/mi-jornada');
  });

  it('manda a los roles de oficina al dashboard', () => {
    expect(rutaHomePorRol(perfilCon('ADMIN'))).toBe('/dashboard');
    expect(rutaHomePorRol(perfilCon('ASISTENTE'))).toBe('/dashboard');
    expect(rutaHomePorRol(perfilCon('SUPERVISOR'))).toBe('/dashboard');
  });

  it('manda a login si no hay perfil (sesion no iniciada)', () => {
    expect(rutaHomePorRol(null)).toBe('/login');
  });
});
