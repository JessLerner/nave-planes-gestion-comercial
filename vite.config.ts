import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // GitHub Pages serves this repository under its name, whereas Vercel serves
  // it from the domain root. A fixed GitHub Pages base made the Vercel build
  // request non-existent JS/CSS assets and resulted in a blank page.
  const base = process.env.VERCEL || process.env.CLOUDFLARE_WORKER
    ? '/'
    : process.env.VITE_BASE_PATH || '/nave-planes-gestion-comercial/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
