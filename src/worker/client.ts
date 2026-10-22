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
  const seconds = Math.round(ms / 1000);
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
      abortAll(`İşlem ${seconds} saniyede bitmedi. Model değişmedi.`);
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

/**
 * X96: süre sınırı model büyüklüğüyle büyür: 1,47M üçgende Tapa kesimi tek başına
 * ~40 s, paralel işlerle 120 s'yi aşabiliyor. Milyon üçgen başına 4 dk, en az 2 dk.
 */
export function limitFor(triangles: number): number {
  return Math.max(GEOMETRY_TIMEOUT_MS, Math.ceil((triangles / 1e6) * 240_000));
}

function call<T>(run: (api: Comlink.Remote<GeometryApi>) => Promise<T>, triangles = 0): Promise<T> {
  return limitCall(run(spawn()), limitFor(triangles));
}

const trisOf = (mesh: { indices: Uint32Array }) => mesh.indices.length / 3;

/** Her uzun çağrı iptal ve zaman aşımı taşır. Worker ilk çağrıda kurulur. */
export const geometry: GeometryApi = {
  prepare: (positions, indices, labels) =>
    call(
      (api) => api.prepare(positions, indices, labels),
      indices ? indices.length / 3 : positions.length / 9,
    ),
  cut: (mesh, opts, geomKey, onStage) =>
    call(
      async (api) => api.cut(mesh, opts, geomKey, onStage ? Comlink.proxy(onStage) : undefined),
      trisOf(mesh),
    ),
  preview: (mesh, opts, geomKey) => call((api) => api.preview(mesh, opts, geomKey), trisOf(mesh)),
  pinLayout: (mesh, opts) => call((api) => api.pinLayout(mesh, opts), trisOf(mesh)),
  suggest: (mesh, slot) => call((api) => api.suggest(mesh, slot), trisOf(mesh)),
  voxel: (mesh, resolution) => call((api) => api.voxel(mesh, resolution), trisOf(mesh)),
  refine: (mesh, edgeLength) => call((api) => api.refine(mesh, edgeLength), trisOf(mesh)),
  coupon: (pin, clearances, depthClearance) =>
    call((api) => api.coupon(pin, clearances, depthClearance)),
  split: (mesh) => call((api) => api.split(mesh), trisOf(mesh)),
  simplify: (mesh, target) => call((api) => api.simplify(mesh, target), trisOf(mesh)),
  sample: () => call((api) => api.sample()),
};
