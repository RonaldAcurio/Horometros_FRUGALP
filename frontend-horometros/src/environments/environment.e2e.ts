// Usado SOLO por la configuración 'e2e' de angular.json (build/serve) - ver CLAUDE.md, "Pruebas end-to-end".
// Apunta al backend local de pruebas (BD de test, NODE_ENV=test - ver package.json del backend, 'e2e:server'),
// nunca al backend real. Separado de environment.development.ts para no tocar el flujo normal de desarrollo.
export const environment = {
    production: false,
    apiUrl: 'http://localhost:3000/api',
};
