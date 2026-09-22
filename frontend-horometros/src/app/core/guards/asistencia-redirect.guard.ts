import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// El menu de 3 tarjetas (asistencia-menu) solo tiene sentido para ADMIN, que puede necesitar entrar a
// cualquiera de los paneles. Los demas roles tienen un solo panel propio, asi que van directo ahi - evita
// que, por ejemplo, un SUPERVISOR termine viendo el menu y entrando al panel de la ASISTENTE (ver CLAUDE.md).
export const asistenciaRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.tieneRol('SUPERVISOR')) {
    return router.createUrlTree(['/asistencia/supervisor']);
  }
  if (authService.tieneRol('ASISTENTE')) {
    return router.createUrlTree(['/asistencia/asistente']);
  }
  if (authService.tieneRol('ESCANER')) {
    return router.createUrlTree(['/asistencia/marcacion']);
  }

  return true;
};
