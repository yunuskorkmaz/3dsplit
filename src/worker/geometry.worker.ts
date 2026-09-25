import * as Comlink from 'comlink';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { type CutOptions, cutRegion, previewCut, splitComponents } from '../core/cut';
import { fromManifold, initKernel, KernelError, toManifold } from '../core/kernel';
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

  async cut(mesh: LabeledMesh, opts: CutOptions) {
    await ready;
    const r = cutRegion(mesh, opts);
    return Comlink.transfer(r, buffersOf([r.body, ...r.parts]));
  },

  async preview(mesh: LabeledMesh, opts: CutOptions) {
    await ready;
    return previewCut(mesh, opts);
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
