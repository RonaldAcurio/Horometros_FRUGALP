import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo utils puros por ahora (ver CLAUDE.md, "Pruebas unitarias reales") - los controllers siguen sin
    // pruebas propias porque requieren mockear Sequelize/Express, no hay nada bloqueando agregarlos despues.
    include: ['src/**/*.test.ts'],
  },
});
