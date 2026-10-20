/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // En desarrollo, las llamadas /api se envían al Worker local (wrangler dev)
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: { VITE_USE_MOCKS: 'true', VITE_MOCK_LATENCY_MS: '0' },
    css: false,
    // Pruebas de pantallas completas (tablas, filtros, gráficas) en jsdom: holgura al correr en paralelo
    testTimeout: 15000
  }
});
