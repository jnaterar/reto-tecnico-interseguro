import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, el frontend llama a rutas relativas (/endorse-api, /routes-api)
// y Vite las reenvía a cada backend. En Docker el mismo contrato lo resuelve
// nginx (ver nginx.conf), por lo que no hay URLs absolutas en el código.
const ENDORSE_TARGET = process.env.ENDORSE_API_PROXY ?? 'http://localhost:8082';
const ROUTES_TARGET = process.env.ROUTES_API_PROXY ?? 'http://localhost:8081';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/endorse-api': {
        target: ENDORSE_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/endorse-api/, ''),
      },
      '/routes-api': {
        target: ROUTES_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/routes-api/, ''),
      },
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
