import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { rutaHomePorRol } from '../utils/rutas-por-rol';

// El menu de 3 tarjetas (asistencia-menu) solo tiene sentido para ADMIN, que puede necesitar entrar a
// cualquiera de los paneles. Los demas roles tienen un solo panel propio, asi que van directo ahi - evita
// que, por ejemplo, un SUPERVISOR termine viendo el menu y entrando al panel de la ASISTENTE (ver CLAUDE.md).
export const asistenciaRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const perfil = authService.perfil();

  if (authService.tieneRol('SUPERVISOR')) {
    return router.createUrlTree(['/asistencia/supervisor']);
  }
  if (authService.tieneRol('ASISTENTE')) {
    return router.createUrlTree(['/asistencia/asistente']);
  }
  // ESCANER y MECANICO/OPERADOR tienen su propia pantalla dedicada (nunca /asistencia/marcacion directo,
  // ver escaner-menu y mi-jornada) - esto solo aplica si alguien escribe /asistencia a mano, el login ya
  // los manda directo a su ruta.
  if (authService.tieneRol('ESCANER', 'MECANICO', 'OPERADOR')) {
    return router.createUrlTree([rutaHomePorRol(perfil)]);
  }

  return true;
};
