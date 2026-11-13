import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  // 地图数据与 3D 车体都由打包 import 生成，没有任何运行时静态资产，
  // 所以关掉 publicDir：子路径部署和 SPA 回源主机上都不会有路径歧义。
  publicDir: false,
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
