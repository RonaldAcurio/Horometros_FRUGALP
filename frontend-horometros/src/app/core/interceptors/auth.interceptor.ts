import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/*
1. Le agrega 'Authorization: Bearer <token>' a toda request saliente que tenga sesion activa.
2. Si el backend responde 401 (token invalido, expirado, o - para un Operador - su jornada se cerro mientras
   el token seguia "vivo", ver verificarJornadaOperadorActiva en el backend), cierra la sesion local y manda
   al Login. Se excluye la propia peticion de login: un usuario/clave incorrectos tambien contesta con error,
   pero ahi todavia no hay sesion que cerrar - ese error lo maneja directamente la pantalla de Login.
*/
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();

  const requestConToken = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(requestConToken).pipe(
    catchError((error) => {
      const esPeticionDeLogin = req.url.includes('/auth/login');
      if (error?.status === 401 && !esPeticionDeLogin) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
