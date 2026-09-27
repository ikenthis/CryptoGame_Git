import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
});
