import type { LabeledMesh } from '../core/types';
import { GeometryAbort } from '../worker/client';
import { notify, set } from './store';

/** Konumu değişen üçgenleri viewport'ta yerinde güncellemek için kanca. */
export let onGeometryChanged: ((partId: string, tris: ArrayLike<number> | null) => void) | null =
  null;

export function setGeometryChangedHook(fn: typeof onGeometryChanged): void {
  onGeometryChanged = fn;
}

/** Viewport'un değişen üçgenleri yeniden boyaması için kanca. */
export let onLabelsChanged: ((partId: string, tris?: ArrayLike<number>) => void) | null = null;

export function setLabelsChangedHook(fn: typeof onLabelsChanged): void {
  onLabelsChanged = fn;
}

/**
 * Geometri anahtarı: mesh nesnesi + konum sürümü. Worker aynı anahtarda
 * modelin manifold'unu yeniden kullanır. Konumlar yerinde değişince
 * (yumuşatma fırçası, geri alma) sürüm artar.
 */
const meshIds = new WeakMap<LabeledMesh, number>();

const geomVersions = new WeakMap<LabeledMesh, number>();

let meshCounter = 0;

export function geomKey(mesh: LabeledMesh): string {
  let id = meshIds.get(mesh);
  if (id === undefined) {
    id = ++meshCounter;
    meshIds.set(mesh, id);
  }
  return `${id}:${geomVersions.get(mesh) ?? 0}`;
}

export function bumpGeometry(mesh: LabeledMesh): void {
  geomVersions.set(mesh, (geomVersions.get(mesh) ?? 0) + 1);
}

// ---------- yardımcı ----------

export async function busy(label: string, fn: () => Promise<void>): Promise<void> {
  set({ busy: label, busyStage: null, busyStarted: Date.now() });
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof GeometryAbort)) console.error(e);
    notify('error', e instanceof Error ? e.message : String(e));
  } finally {
    set({ busy: null, busyStage: null });
  }
}
