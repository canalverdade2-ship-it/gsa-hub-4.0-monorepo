import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Production is mounted by nginx under /gsa3/; development stays at /.
  // This keeps client-side links inside the deployed application mount.
  base: process.env.GSA_PUBLIC_BASE_PATH || (command === 'build' ? '/gsa3/' : '/'),
  server: {
    port: 5180,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:4180'
    }
  }
}));
