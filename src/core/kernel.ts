import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import type { LabeledMesh, MeshData } from './types';

let modulePromise: Promise<ManifoldToplevel> | null = null;
let wasm: ManifoldToplevel | null = null;

/** manifold-3d WASM modülünü bir kez yükler. Tarayıcıda wasm dosyasının URL'i verilmeli. */
export async function initKernel(wasmUrl?: string): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((m) => {
      m.setup();
      wasm = m;
      return m;
    });
  }
  return modulePromise;
}

export function kernel(): ManifoldToplevel {
  if (!wasm) throw new Error('manifold-3d henüz yüklenmedi (initKernel çağrılmalı)');
  return wasm;
}

/**
 * Kesim sırasında oluşan yeni yüzlerin faceID'si. 0xffffffff kullanılamaz:
 * manifold onu "faceID yok" sayıp kendi yüz numaralarını yazıyor. Etiket
 * (≤ 0xffff) ve üçgen numarasıyla çakışmayacak kadar büyük.
 */
export const CUT_FACE_ID = 0x7ffffffe;

export class KernelError extends Error {}

/** Mesh'ten Manifold üretir. Etiketler faceID olarak taşınır. */
export function toManifold(mesh: MeshData, faceIds?: Uint32Array | Uint16Array | number): Manifold {
  const { Manifold, Mesh } = kernel();
  const triCount = mesh.indices.length / 3;
  let faceID: Uint32Array | undefined;
  if (typeof faceIds === 'number') {
    faceID = new Uint32Array(triCount).fill(faceIds);
  } else if (faceIds) {
    faceID = faceIds instanceof Uint32Array ? faceIds : Uint32Array.from(faceIds);
  }
  const m = new Mesh({
    numProp: 3,
    vertProperties: mesh.positions,
    triVerts: mesh.indices,
    ...(faceID ? { faceID } : {}),
  });
  m.merge();
  let man: Manifold;
  try {
    man = new Manifold(m);
  } catch (e) {
    throw new KernelError(`Mesh kapalı/manifold değil (${e instanceof Error ? e.message : e})`);
  }
  const status = man.status();
  if (status !== 'NoError') {
    man.delete();
    throw new KernelError(`Mesh kapalı/manifold değil (${status})`);
  }
  return man;
}

/**
 * Manifold'dan etiketli mesh'e döner. faceID etiket olarak okunur;
 * CUT_FACE_ID olan yüzler `cutLabel` alır.
 */
export function fromManifold(man: Manifold, cutLabel: number): LabeledMesh {
  const mesh = man.getMesh();
  const positions =
    mesh.numProp === 3
      ? new Float32Array(mesh.vertProperties)
      : stripProps(mesh.vertProperties, mesh.numProp);
  const indices = new Uint32Array(mesh.triVerts);
  const triCount = indices.length / 3;
  const labels = new Uint16Array(triCount);
  const faceID = mesh.faceID;
  for (let t = 0; t < triCount; t++) {
    const id = faceID && faceID.length === triCount ? faceID[t] : cutLabel;
    labels[t] = id === CUT_FACE_ID || id > 0xffff ? cutLabel : id;
  }
  return { positions, indices, labels };
}

/**
 * Manifold'dan etiketli mesh'e döner; faceID orijinal mesh'in üçgen numarasıdır,
 * etiket `labels`'tan okunur. CUT_FACE_ID olan yüzler `cutLabel` alır.
 * (Manifold etiketlerden bağımsız kurulduğu için boyama değişse de yeniden kullanılabilir.)
 */
export function fromManifoldMapped(
  man: Manifold,
  labels: Uint16Array,
  cutLabel: number,
): LabeledMesh {
  const mesh = man.getMesh();
  const positions =
    mesh.numProp === 3
      ? new Float32Array(mesh.vertProperties)
      : stripProps(mesh.vertProperties, mesh.numProp);
  const indices = new Uint32Array(mesh.triVerts);
  const triCount = indices.length / 3;
  const out = new Uint16Array(triCount);
  const faceID = mesh.faceID;
  for (let t = 0; t < triCount; t++) {
    const id = faceID && faceID.length === triCount ? faceID[t] : CUT_FACE_ID;
    out[t] = id < labels.length ? labels[id] : cutLabel;
  }
  return { positions, indices, labels: out };
}

/** Yüz kimliği = üçgen numarası olan model manifold'u (etiketler sonra eşlenir). */
export function modelManifold(mesh: MeshData): Manifold {
  const ids = new Uint32Array(mesh.indices.length / 3);
  for (let t = 0; t < ids.length; t++) ids[t] = t;
  return toManifold(mesh, ids);
}

function stripProps(props: Float32Array, numProp: number): Float32Array {
  const n = props.length / numProp;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[3 * i] = props[numProp * i];
    out[3 * i + 1] = props[numProp * i + 1];
    out[3 * i + 2] = props[numProp * i + 2];
  }
  return out;
}

/** Manifold nesnelerini iş bitince serbest bırakmak için yardımcı. */
export class Scope {
  private items: Manifold[] = [];
  keep<T extends Manifold>(m: T): T {
    this.items.push(m);
    return m;
  }
  dispose(): void {
    for (const m of this.items) m.delete();
    this.items = [];
  }
}
