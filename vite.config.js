import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // The GeoJSON datasets in ./data are copied to the site root at build time
  // and fetched at runtime, so they stay out of the JS bundle.
  publicDir: 'data',
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 640,
  },
});
