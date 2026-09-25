import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // '.itest.ts' (no '.integration.test.ts') a proposito: el glob de vitest.config.mts es '*.test.ts', que
    // tambien matchearia un sufijo '.integration.test.ts' - habria corrido estos archivos ahi tambien, sin BD
    // ni las variables de entorno de abajo.
    include: ['src/**/*.itest.ts'],
    globalSetup: ['src/test-setup/migrar-bd-test.ts'],
    env: {
      NODE_ENV: 'test',
      // Claves de prueba, fijas y sin ningun valor real (mismo patron que vitest.config.mts) - la app entera
      // (login, cifrado de PII del Operador) revienta al arrancar si faltan.
      JWT_SECRET: 'clave_de_pruebas_integracion_no_usar_en_produccion',
      CIFRADO_CLAVE: '1'.repeat(64),
    },
    // Los tests comparten UNA sola base de datos real (se limpia entre archivos, ver test-setup/helpers.ts) -
    // correrlos en paralelo se pisarian entre si. Nunca en paralelo, a proposito.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
