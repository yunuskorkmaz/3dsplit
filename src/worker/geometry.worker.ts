import * as Comlink from 'comlink';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { CutError, type CutOptions, cutRegion, previewCut, splitComponents, suggestCutMode } from '../core/cut';
import type { Manifold } from 'manifold-3d';
import { fromManifold, initKernel, KernelError, modelManifold, toManifold } from '../core/kernel';
import { refineMesh } from '../core/refine';
import { type RepairReport, repairMesh } from '../core/repair';
import { BASE_SLOT, type LabeledMesh } from '../core/types';

export interface PreparedMesh {
  mesh: LabeledMesh;
  report: RepairReport;
  /** Kernel doğrulamasından geçti mi (kesim için gerekli). */
  manifold: boolean;
  error?: string;
}

const ready = initKernel(wasmUrl);

/**
 * Son kullanılan parçanın manifold'u. Anahtar geometriyi (konumlar) tanımlar;
 * etiketler manifold'da değil, sonuçta eşlendiği için boyama değişse de geçerli.
 * 1-2M üçgende her önizleme/kesimde yeniden kurmak ~2 s sürüyordu.
 */
let cached: { key: string; man: Manifold } | null = null;

function modelProvider(mesh: LabeledMesh, key?: string) {
  if (!key) return undefined;
  return () => {
    if (cached?.key !== key) {
      cached?.man.delete();
      cached = null;
      cached = { key, man: modelManifold(mesh) };
    }
    return cached.man;
  };
}

function buffersOf(meshes: LabeledMesh[]): ArrayBuffer[] {
  return meshes.flatMap((m) => [m.positions.buffer, m.indices.buffer, m.labels.buffer] as ArrayBuffer[]);
}

const api = {
  /** Yükleme: onarım + manifold doğrulaması. */
  async prepare(positions: Float32Array, indices?: Uint32Array): Promise<PreparedMesh> {
    await ready;
    const { mesh, report } = repairMesh(positions, indices);
    let result: PreparedMesh;
    try {
      const man = toManifold(mesh);
      const canonical = fromManifold(man, BASE_SLOT);
      man.delete();
      canonical.labels.fill(BASE_SLOT);
      result = { mesh: canonical, report, manifold: true };
    } catch (e) {
      const labels = new Uint16Array(mesh.indices.length / 3);
      result = {
        mesh: { ...mesh, labels },
        report,
        manifold: false,
        error: e instanceof KernelError ? e.message : String(e),
      };
    }
    return Comlink.transfer(result, buffersOf([result.mesh]));
  },

  /** Kesim hatası Error olarak değil veri olarak döner: Comlink hata nesnesinin ek alanlarını (sorunlu halkalar) taşımıyor. */
  async cut(mesh: LabeledMesh, opts: CutOptions, geomKey?: string) {
    await ready;
    try {
      const r = cutRegion(mesh, opts, modelProvider(mesh, geomKey));
      return Comlink.transfer({ ok: true as const, ...r }, buffersOf([r.body, ...r.parts]));
    } catch (e) {
      if (e instanceof CutError) return { ok: false as const, error: e.message, loops: e.loops ?? [] };
      throw e;
    }
  },

  async preview(mesh: LabeledMesh, opts: CutOptions, geomKey?: string) {
    await ready;
    return previewCut(mesh, opts, modelProvider(mesh, geomKey));
  },

  async suggest(mesh: LabeledMesh, slot: number) {
    await ready;
    return suggestCutMode(mesh, slot);
  },

  async refine(mesh: LabeledMesh, edgeLength: number) {
    await ready;
    const r = refineMesh(mesh, edgeLength);
    return Comlink.transfer(r, buffersOf([r]));
  },

  async split(mesh: LabeledMesh) {
    await ready;
    const pieces = splitComponents(mesh);
    return Comlink.transfer(pieces, buffersOf(pieces));
  },
};

export type GeometryApi = typeof api;

Comlink.expose(api);
