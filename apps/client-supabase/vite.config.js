import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Production is mounted under its own path; development stays at /.
  // This keeps client-side links inside the deployed application mount.
  base: process.env.GSA_PUBLIC_BASE_PATH || (command === 'build' ? '/client-supabase/' : '/'),
  server: {
    port: 5180,
    strictPort: false
  }
}));
