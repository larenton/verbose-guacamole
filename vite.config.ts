import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fully static bundle served from GitHub Pages under /verbose-guacamole/.
// The app uses hash routing (view lives in location.hash), so a refresh always
// resolves to index.html and Pages never 404s on a route.
export default defineConfig({
  base: '/verbose-guacamole/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // The two SheetJS libraries are lazy-loaded (import/export only), so their
    // large chunks never hit the initial load.
    chunkSizeWarningLimit: 700,
  },
});
