import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Evita que alguien ya logueado vuelva a ver la pantalla de Login (lo manda directo al dashboard).
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.estaAutenticado()) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
