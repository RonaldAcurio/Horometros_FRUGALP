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
        loadComponent: () => import('./components/asistencia/asistencia').then(m => m.AsistenciaComponent)
    },
    {
        path: '**',
        redirectTo: 'dashboard'
    }
];
