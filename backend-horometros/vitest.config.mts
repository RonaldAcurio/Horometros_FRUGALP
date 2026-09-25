import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo utils puros por ahora (ver CLAUDE.md, "Pruebas unitarias reales") - los controllers siguen sin
    // pruebas propias porque requieren mockear Sequelize/Express, no hay nada bloqueando agregarlos despues.
    include: ['src/**/*.test.ts'],
    env: {
      // Clave DE PRUEBA, fija y sin ningun valor real (ver utils/cifrado.ts) - cifrado.ts revienta al
      // importarse si falta esta variable, y algunos tests (y el modelo Operador, que ya usa cifrado.ts en
      // sus getters/setters) la necesitan presente para poder cargar en absoluto. Nunca usar en produccion.
      CIFRADO_CLAVE: '0'.repeat(64),
    },
  },
});
