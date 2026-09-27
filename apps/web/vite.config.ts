import { defineConfig } from 'vite';

// GENTIUM_DEMO=1 compila la demo sin servidor (práctica, tutorial, cartas y armería).
const demo = process.env.GENTIUM_DEMO === '1';

export default defineConfig({
  define: { __DEMO__: JSON.stringify(demo) },
  build: demo ? { outDir: 'dist-demo', assetsInlineLimit: Number.MAX_SAFE_INTEGER, modulePreload: false } : {},
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
});
