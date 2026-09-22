import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { rutaHomePorRol } from '../utils/rutas-por-rol';

// Usado en la ruta comodin '**': manda a cada quien a SU "hogar" (ver rutas-por-rol.ts), nunca a un
// '/dashboard' fijo que roles como ESCANER o MECANICO/OPERADOR ni siquiera pueden ver.
export const homeRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return router.createUrlTree([rutaHomePorRol(authService.perfil())]);
};
