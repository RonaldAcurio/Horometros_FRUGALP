import { PerfilCuenta } from '../models/auth.model';

/*
Un solo lugar que decide "a donde pertenece cada rol" - lo usan el login (a donde navegar tras autenticarse),
roleGuard (a donde mandar a alguien que no tiene el rol de la ruta) y el boton "Menú" del header. Antes cada
uno hardcodeaba '/dashboard'; con ESCANER y MECANICO/OPERADOR teniendo sus propias pantallas dedicadas (sin
Dashboard), esto evitaba hasta un loop de redirects (roleGuard rechazando /dashboard mandaba de vuelta a
/dashboard). Mantenerlo en un solo sitio es lo que evita que un nuevo rol se quede sin ruta de "vuelta a casa".
*/
export const rutaHomePorRol = (perfil: PerfilCuenta | null): string => {
  switch (perfil?.rol) {
    case 'ESCANER':
      return '/escaner';
    case 'MECANICO':
    case 'OPERADOR':
      return '/mi-jornada';
    case 'ADMIN':
    case 'ASISTENTE':
    case 'SUPERVISOR':
      return '/dashboard';
    default:
      // Sin perfil (o rol desconocido): a login, no hay "home" que ofrecer.
      return '/login';
  }
};
