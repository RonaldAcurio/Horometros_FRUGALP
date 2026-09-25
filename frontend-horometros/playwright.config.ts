import { defineConfig, devices } from '@playwright/test';

/*
Pruebas end-to-end reales (ver CLAUDE.md, "Pruebas end-to-end"): navegan la UI de verdad, contra un backend y
un Postgres reales (BD de TEST, nunca development/producción - ver 'e2e:server' en el package.json del
backend). No en paralelo (fullyParallel:false, un solo worker): todos los specs comparten el mismo backend y
la misma BD, correr varios a la vez se pisaría entre sí (ej. dos specs reseteando la misma clave del mismo
usuario sembrado).
*/
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    timeout: 30_000,
    use: {
        baseURL: 'http://localhost:4200',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    // Playwright levanta y apaga los dos servidores solo, antes/despues de la corrida completa - no hace
    // falta arrancar nada a mano para correr 'npm run test:e2e'.
    webServer: [
        {
            command: 'npm run e2e:server',
            cwd: '../backend-horometros',
            url: 'http://localhost:3000/api/health',
            timeout: 60_000,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'npx ng serve --configuration=e2e --port 4200',
            url: 'http://localhost:4200',
            timeout: 90_000,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
