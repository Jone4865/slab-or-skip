import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /slab-or-skip/.
export default defineConfig({
  plugins: [react()],
  base: process.env.GH_PAGES ? '/slab-or-skip/' : '/',
  build: { target: 'es2022', sourcemap: false },
});
