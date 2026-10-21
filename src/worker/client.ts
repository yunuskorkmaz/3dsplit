import * as Comlink from 'comlink';
import type { GeometryApi } from './geometry.worker';

/** Uzun kesim ve onarım bu sürede bitmezse iptal edilir. */
export const GEOMETRY_TIMEOUT_MS = 120_000;

/** Kullanıcı iptali veya zaman aşımı. Model bu hatadan sonra değişmez. */
export class GeometryAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeometryAbort';
  }
}

let worker: Worker | null = null;
let remote: Comlink.Remote<GeometryApi> | null = null;
let generation = 0;
const waiters = new Set<(err: GeometryAbort) => void>();

function spawn(): Comlink.Remote<GeometryApi> {
  if (!remote) {
    worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    remote = Comlink.wrap<GeometryApi>(worker);
  }
  return remote;
}

/** Worker kapanır. Sonraki çağrı yenisini açar; manifold önbelleği o zaman yeniden kurulur. */
export function restartGeometryWorker(): void {
  worker?.terminate();
  worker = null;
  remote = null;
}

function abortAll(message: string): void {
  generation++;
  const err = new GeometryAbort(message);
  for (const reject of waiters) reject(err);
  waiters.clear();
  restartGeometryWorker();
}

/** Süren işi keser. Arayüz modeli ve geri alma yığınını bu çağrıda değiştirmez. */
export function cancelGeometry(): void {
  abortAll('İşlem iptal edildi. Model değişmedi.');
}

/**
 * `work` bitene, iptal edilene veya süre dolana kadar bekler. İptal ve süre
 * worker'ı kapatır; geç gelen sonuç uygulanmaz.
 */
export function limitCall<T>(work: Promise<T>, ms = GEOMETRY_TIMEOUT_MS): Promise<T> {
  const gen = generation;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      waiters.delete(onCancel);
      fn();
    };
    const onCancel = (err: GeometryAbort) => finish(() => reject(err));
    const timer = setTimeout(() => {
      if (gen !== generation) {
        finish(() => undefined);
        return;
      }
      abortAll('İşlem 120 saniyede bitmedi. Model değişmedi.');
    }, ms);
    waiters.add(onCancel);
    work.then(
      (value) => finish(() => (gen === generation ? resolve(value) : undefined)),
      (err: unknown) =>
        finish(() => {
          if (gen !== generation) return;
          reject(err instanceof Error ? err : new Error(String(err)));
        }),
    );
  });
}

function call<T>(run: (api: Comlink.Remote<GeometryApi>) => Promise<T>): Promise<T> {
  return limitCall(run(spawn()));
}

/** Her uzun çağrı iptal ve zaman aşımı taşır. Worker ilk çağrıda kurulur. */
export const geometry: GeometryApi = {
  prepare: (positions, indices, labels) => call((api) => api.prepare(positions, indices, labels)),
  cut: (mesh, opts, geomKey) => call(async (api) => api.cut(mesh, opts, geomKey)),
  preview: (mesh, opts, geomKey) => call((api) => api.preview(mesh, opts, geomKey)),
  pinLayout: (mesh, opts) => call((api) => api.pinLayout(mesh, opts)),
  suggest: (mesh, slot) => call((api) => api.suggest(mesh, slot)),
  voxel: (mesh, resolution) => call((api) => api.voxel(mesh, resolution)),
  refine: (mesh, edgeLength) => call((api) => api.refine(mesh, edgeLength)),
  coupon: (pin, clearances, depthClearance) =>
    call((api) => api.coupon(pin, clearances, depthClearance)),
  split: (mesh) => call((api) => api.split(mesh)),
  sample: () => call((api) => api.sample()),
};
