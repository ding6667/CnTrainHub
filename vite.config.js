import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  // Map data is imported (and code-split) by src/main.js rather than fetched, so
  // it resolves correctly under sub-path deployments and SPA fallback hosts.
  // public/ is back on because the 3D showcase loads a .glb by URL.
  publicDir: 'public',
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        detail: fileURLToPath(new URL('./detail.html', import.meta.url)),
      },
    },
  },
});
