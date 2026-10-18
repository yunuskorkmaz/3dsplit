import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages proje sitesi https://yunuskorkmaz.github.io/3dsplit/ adresinde
  // yayınlanır. Yerelde ve önizlemede kök (`/`) kalır.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d'] },
  test: { environment: 'node', testTimeout: 30000, include: ['test/**/*.test.ts'] },
});
