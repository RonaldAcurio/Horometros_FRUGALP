import { ApplicationConfig, provideZoneChangeDetection, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({eventCoalescing: true}),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    /*
    Service worker (2026-09-29, ver CLAUDE.md "Actualizar sin reinstalar el .apk"): cachea el shell de la app
    (index.html + JS/CSS) en el propio dispositivo para que siga arrancando SIN señal, incluso cuando
    capacitor.config.ts carga la app desde el link de Vercel en vez de los archivos empaquetados en el .apk -
    sin esto, "cargar desde Vercel" significaría que la app no abre nada si no hay internet en ese momento,
    rompiendo justo el Panel de Actividades offline-first que ya se probó y funciona. `registerWhenStable:30000`
    es el valor por defecto del schematic de Angular: registra el SW una vez la app ya cargó y quedó estable
    (o a los 30s como máximo), para no competir por ancho de banda con la carga inicial.
    */
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
