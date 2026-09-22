import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RolCuenta } from '../models/auth.model';
import { rutaHomePorRol } from '../utils/rutas-por-rol';

// Factory: roleGuard('ADMIN') protege una ruta a un solo rol (o varios). Asume que authGuard ya corrio antes
// (o corre junto, en la misma ruta) - aca solo se valida el rol, no la sesion.
export const roleGuard = (...rolesPermitidos: RolCuenta[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.tieneRol(...rolesPermitidos)) {
      return true;
    }

    // A la ruta "hogar" del rol real, no a un '/dashboard' fijo - ESCANER y MECANICO/OPERADOR no tienen
    // Dashboard, y mandarlos ahi de todas formas terminaria en un loop de redirects.
    return router.createUrlTree([rutaHomePorRol(authService.perfil())]);
  };
};
