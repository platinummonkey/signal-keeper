import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: join(projectRoot, 'src/client'),
  build: {
    outDir: join(projectRoot, 'dist/client'),
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      // SSE route first — needs connection kept alive end-to-end
      '/api/events': {
        target: 'http://localhost:7777',
        changeOrigin: true,
        // Disable response buffering so SSE events are streamed immediately
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      // All other API routes
      '/api': {
        target: 'http://localhost:7777',
        changeOrigin: true,
      },
    },
  },
});
