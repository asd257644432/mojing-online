import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'client', publicDir: '../public',
  input: {
    game: resolve(import.meta.dirname, 'client/index.html'),
    modelLab: resolve(import.meta.dirname, 'client/model-lab.html'),
    effectsLab: resolve(import.meta.dirname, 'client/effects-lab.html'),
    tripoLab: resolve(import.meta.dirname, 'client/tripo-lab.html'),
  },
  server: { port: 5273, strictPort: true, proxy: {
    '/api': 'http://127.0.0.1:8877',
    '/ws': { target: 'ws://127.0.0.1:8877', ws: true },
  } },
  build: { outDir: '../dist/client', emptyOutDir: true },
});
