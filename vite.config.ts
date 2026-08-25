import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fully static bundle, no absolute base path, so it runs from localhost,
// a file:// path, or any static host without a rebuild. Hash routing is used
// in-app so deep links survive under file://.
export default defineConfig({
  base: './',
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
