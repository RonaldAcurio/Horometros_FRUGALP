import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';
import { asistenciaRedirectGuard } from './core/guards/asistencia-redirect.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
    },
    {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
    },
    {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
    },
    {
        // ADMIN y ASISTENTE entran (crear/listar Usuarios de oficina) - dentro de la pagina, la pestaña
        // Haciendas/Token se oculta si el rol no es ADMIN (ver admin-panel.ts).
        path: 'admin',
        canActivate: [authGuard, roleGuard('ADMIN', 'ASISTENTE')],
        loadComponent: () => import('./features/admin/pages/admin-panel/admin-panel').then(m => m.AdminPanel)
    },
    {
        path: 'horometros',
        canActivate: [authGuard],
        loadComponent: () => import('./features/horometros/horometros.component').then(m => m.HorometrosComponent)
    },
    {
        // El menu de 3 tarjetas solo se ve tal cual para ADMIN - los demas roles son redirigidos
        // directo a su propio panel por asistenciaRedirectGuard (ver ese archivo).
        path: 'asistencia',
        canActivate: [authGuard, asistenciaRedirectGuard],
        loadComponent: () => import('./features/asistencia/pages/asistencia-menu/asistencia-menu').then(m => m.AsistenciaMenu)
    },
    // Rutas del Módulo de Asistencia
    {
        path: 'asistencia/asistente',
        canActivate: [authGuard, roleGuard('ADMIN', 'ASISTENTE')],
        loadComponent: () => import('./features/asistencia/pages/asistencia-panel/asistencia-panel').then(m => m.AsistenciaPanel)
    },
    {
        // Kiosco de marcación física: sin guard a propósito - lo usa el trabajador SIN loguearse,
        // escaneando su carnet QR (ver CLAUDE.md, "El carnet físico (kiosco) sigue existiendo").
        path: 'asistencia/marcacion',
        loadComponent: () => import('./features/asistencia/pages/marcacion-kiosco/marcacion-kiosco').then(m => m.MarcacionKiosco)
    },
    {
        path: 'asistencia/supervisor',
        canActivate: [authGuard, roleGuard('ADMIN', 'SUPERVISOR')],
        loadComponent: () => import('./features/asistencia/pages/supervisor-panel/supervisor-panel').then(m => m.SupervisorPanel)
    },
    // Redirección por defecto si entran a /asistencia
    {
        path: 'asistencia',
        redirectTo: 'asistencia/asistente',
        pathMatch: 'full'
    },
    {
        path: '**',
        redirectTo: 'dashboard'
    }
];