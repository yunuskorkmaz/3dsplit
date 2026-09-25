import * as Comlink from 'comlink';
import type { GeometryApi } from './geometry.worker';

/** Ağır geometri işleri (onarım, boolean, kesim) bu Worker'da çalışır. */
export const geometry = Comlink.wrap<GeometryApi>(
  new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
);
