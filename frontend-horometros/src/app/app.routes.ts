import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';
import { asistenciaRedirectGuard } from './core/guards/asistencia-redirect.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';

export const routes: Routes = [
    {
        // Manda a cada rol a SU "hogar" (ver rutas-por-rol.ts) - no todos los roles tienen Dashboard.
        path: '',
        pathMatch: 'full',
        canActivate: [authGuard, homeRedirectGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
    },
    {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
    },
    {
        // Solo roles de oficina (ADMIN/ASISTENTE/SUPERVISOR) tienen Dashboard. ESCANER y MECANICO/OPERADOR
        // caen directo a su propia pantalla dedicada desde el login (ver login.ts) y nunca ven este menu.
        path: 'dashboard',
        canActivate: [authGuard, roleGuard('ADMIN', 'ASISTENTE', 'SUPERVISOR')],
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
        canActivate: [authGuard, roleGuard('ADMIN', 'ASISTENTE', 'SUPERVISOR')],
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
    {
        // Escaneo autenticado del QR flotante de Camino B (distinto del kiosco publico de arriba, que
        // escanea el carnet fisico). Lo usan SUPERVISOR (boton "Escanear" de su panel) y ESCANER (su unica opcion).
        path: 'asistencia/escanear',
        canActivate: [authGuard, roleGuard('ADMIN', 'SUPERVISOR', 'ESCANER')],
        loadComponent: () => import('./features/asistencia/pages/escaneo-sesion/escaneo-sesion').then(m => m.EscaneoSesion)
    },
    {
        // Landing dedicado del rol ESCANER: un solo boton (ver CLAUDE.md, "ESCANER: menu de una sola opcion").
        path: 'escaner',
        canActivate: [authGuard, roleGuard('ESCANER')],
        loadComponent: () => import('./features/asistencia/pages/escaner-menu/escaner-menu').then(m => m.EscanerMenu)
    },
    {
        // Pantalla cautiva de MECANICO/OPERADOR: codigo o QR flotante segun su hacienda, y despues el Panel
        // de Actividades (ver mi-jornada.ts). No hay ningun otro menu para este rol.
        path: 'mi-jornada',
        canActivate: [authGuard, roleGuard('MECANICO', 'OPERADOR')],
        loadComponent: () => import('./features/asistencia/pages/mi-jornada/mi-jornada').then(m => m.MiJornada)
    },
    {
        path: '**',
        canActivate: [authGuard, homeRedirectGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
    }
];
