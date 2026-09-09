import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
    },
    {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
    },
    {
        path: 'horometros',
        loadComponent: () => import('./features/horometros/horometros.component').then(m => m.HorometrosComponent)
    },
    {
        path: 'asistencia',
        loadComponent: () => import('./features/asistencia/pages/asistencia-menu/asistencia-menu').then(m => m.AsistenciaMenu)
    },
    // Rutas del Módulo de Asistencia
    {
        path: 'asistencia/asistente',
        loadComponent: () => import('./features/asistencia/pages/asistencia-panel/asistencia-panel').then(m => m.AsistenciaPanel)
    },
    {
        path: 'asistencia/marcacion',
        loadComponent: () => import('./features/asistencia/pages/marcacion-kiosco/marcacion-kiosco').then(m => m.MarcacionKiosco)
    },
    {
        path: 'asistencia/supervisor',
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