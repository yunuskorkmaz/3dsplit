import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d'] },
  test: { environment: 'node', testTimeout: 30000, include: ['test/**/*.test.ts'] },
});
