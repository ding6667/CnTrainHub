import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Data is imported (and code-split) by src/main.js rather than fetched, so it
  // resolves correctly under sub-path deployments and SPA fallback hosts.
  publicDir: false,
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 700,
  },
});
