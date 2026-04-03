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
});
