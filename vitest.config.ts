import { defineConfig } from 'vitest/config';

// Pruebas del backend (Worker). El frontend tiene su propia configuración en web/vite.config.ts.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
