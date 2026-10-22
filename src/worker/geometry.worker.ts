import * as Comlink from 'comlink';
import type { Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { toleranceCoupon } from '../core/coupon';
import type { PinOptions } from '../core/cut';
import {
  CutError,
  type CutOptions,
  cutRegion,
  pinLayout,
  previewCut,
  splitComponents,
  suggestCutMode,
} from '../core/cut';
import { fromManifold, initKernel, KernelError, modelManifold, toManifold } from '../core/kernel';
import { computeMeshTopology, type MeshTopology, withMeshTopology } from '../core/meshTopology';
import { refineMesh } from '../core/refine';
import { cutOutDefects, type RepairReport, repairMesh } from '../core/repair';
import { sampleFigure } from '../core/sample';
import { simplifyMesh } from '../core/simplify';
import { smoothCutEdge } from '../core/smooth';
import { BASE_SLOT, type LabeledMesh, type MeshData } from '../core/types';
import { voxelRepair } from '../core/voxelRepair';

export interface PreparedMesh {
  mesh: LabeledMesh;
  report: RepairReport;
  /** Temel onarım yetmediyse voxel onarım uygulandı (A2). */
  voxel?: { voxelSize: number; closedGap: number };
  /** X94: hatalı kenar çevresi silinip kapatıldı; silinen üçgen sayısı. */
  local?: { removed: number };
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
let topoCached: { key: string; topo: MeshTopology } | null = null;

/** X68: aynı geometri anahtarında komşuluk ve normaller yeniden kurulmaz. */
function topologyFor(key?: string): (mesh: MeshData) => MeshTopology {
  return (mesh) => {
    if (key && topoCached?.key === key) return topoCached.topo;
    const topo = computeMeshTopology(mesh);
    if (key) topoCached = { key, topo };
    return topo;
  };
}

/** X53: kenar düzeltmesi topolojiyi değiştirir. Orijinal anahtar o katıyı geri verirdi. */
function edgePrepared(
  mesh: LabeledMesh,
  opts: CutOptions,
  geomKey?: string,
): { mesh: LabeledMesh; key?: string } {
  if (!opts.smoothEdge || opts.seamLoop) return { mesh, key: geomKey };
  return {
    mesh: smoothCutEdge(mesh, opts.slot),
    key: geomKey ? `${geomKey}:edge:${opts.slot}:${hashLabels(mesh.labels)}` : undefined,
  };
}

function hashLabels(labels: Uint16Array): string {
  let h = 2166136261;
  for (let i = 0; i < labels.length; i++) {
    h ^= labels[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

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
  return meshes.flatMap(
    (m) => [m.positions.buffer, m.indices.buffer, m.labels.buffer] as ArrayBuffer[],
  );
}

const api = {
  /**
   * Yükleme: onarım + manifold doğrulaması. `labels` verilirse (boyalı 3MF)
   * onarımdan ve manifold'dan üçgen başına geçirilir.
   */
  async prepare(
    positions: Float32Array,
    indices?: Uint32Array,
    labels?: Uint16Array,
  ): Promise<PreparedMesh> {
    await ready;
    const { mesh, report, source } = repairMesh(positions, indices);
    const labelsOf = (src: Int32Array) => {
      const out = new Uint16Array(src.length);
      if (labels)
        for (let t = 0; t < src.length; t++) out[t] = src[t] >= 0 ? labels[src[t]] : BASE_SLOT;
      return out;
    };
    const mapped = labelsOf(source);
    let result: PreparedMesh | null = null;
    let firstError: unknown = null;
    try {
      // faceID = etiket: manifold üçgen sırasını değiştirse de etiket üçgenle birlikte gider
      const man = toManifold(mesh, mapped);
      const canonical = fromManifold(man, BASE_SLOT);
      man.delete();
      result = { mesh: canonical, report, manifold: true };
    } catch (e) {
      firstError = e;
    }
    // X94: birkaç hatalı kenar için bütün modeli voxel'e sokmadan önce yerel onarım
    if (!result) {
      let cur = { mesh, source };
      let removed = 0;
      for (let round = 0; round < 3 && !result; round++) {
        const next = cutOutDefects(cur.mesh, cur.source);
        if (!next) break;
        removed += next.removed;
        cur = next;
        // ayrıntı korunmuyorsa (çok üçgen gitti) voxel'e bırak
        if (removed > source.length * 0.02) break;
        try {
          const man = toManifold(cur.mesh, labelsOf(cur.source));
          const canonical = fromManifold(man, BASE_SLOT);
          man.delete();
          result = { mesh: canonical, report, manifold: true, local: { removed } };
        } catch {
          // bir tur daha
        }
      }
    }
    if (!result) {
      const e = firstError;
      const error = e instanceof KernelError ? e.message : String(e);
      // A2: temel onarım yetmedi, voxel yedek onarım
      try {
        const v = voxelRepair({ ...mesh, labels: mapped });
        const man = toManifold(v.mesh, v.mesh.labels);
        const canonical = fromManifold(man, BASE_SLOT);
        man.delete();
        result = {
          mesh: canonical,
          report,
          manifold: true,
          voxel: { voxelSize: v.voxelSize, closedGap: v.closedGap },
        };
      } catch {
        result = { mesh: { ...mesh, labels: mapped }, report, manifold: false, error };
      }
    }
    return Comlink.transfer(result, buffersOf([result.mesh]));
  },

  /** Kesim hatası Error olarak değil veri olarak döner: Comlink hata nesnesinin ek alanlarını (sorunlu halkalar) taşımıyor. */
  async cut(mesh: LabeledMesh, opts: CutOptions, geomKey?: string) {
    await ready;
    try {
      const prepared = edgePrepared(mesh, opts, geomKey);
      const r = withMeshTopology(topologyFor(prepared.key), () =>
        cutRegion(prepared.mesh, opts, modelProvider(prepared.mesh, prepared.key)),
      );
      return Comlink.transfer({ ok: true as const, ...r }, buffersOf([r.body, ...r.parts]));
    } catch (e) {
      if (e instanceof CutError)
        return { ok: false as const, error: e.message, loops: e.loops ?? [] };
      throw e;
    }
  },

  /** X96: büyük modeli hedef üçgen sayısına sadeleştirir. */
  async simplify(mesh: LabeledMesh, targetTriangles: number) {
    await ready;
    const r = simplifyMesh(mesh, targetTriangles);
    return Comlink.transfer(r, buffersOf([r.mesh]));
  },

  async preview(mesh: LabeledMesh, opts: CutOptions, geomKey?: string) {
    await ready;
    const prepared = edgePrepared(mesh, opts, geomKey);
    return withMeshTopology(topologyFor(prepared.key), () =>
      previewCut(prepared.mesh, opts, modelProvider(prepared.mesh, prepared.key)),
    );
  },

  async pinLayout(mesh: LabeledMesh, opts: CutOptions) {
    await ready;
    try {
      return pinLayout(edgePrepared(mesh, opts).mesh, opts);
    } catch {
      // bölge henüz kesilebilir değil (ör. açık sınır): pim gösterilmez
      return [];
    }
  },

  async suggest(mesh: LabeledMesh, slot: number) {
    await ready;
    return suggestCutMode(mesh, slot);
  },

  /** Elle voxel onarım (A2): her mesh'i kapalı yapar, ayrıntı voksel boyutu kadar kaybolur. */
  async voxel(mesh: LabeledMesh, resolution: number) {
    await ready;
    const v = voxelRepair(mesh, resolution);
    const man = toManifold(v.mesh, v.mesh.labels);
    const out = fromManifold(man, BASE_SLOT);
    man.delete();
    return Comlink.transfer(
      { mesh: out, voxelSize: v.voxelSize, closedGap: v.closedGap },
      buffersOf([out]),
    );
  },

  async refine(mesh: LabeledMesh, edgeLength: number) {
    await ready;
    const r = refineMesh(mesh, edgeLength);
    return Comlink.transfer(r, buffersOf([r]));
  },

  async coupon(pin: PinOptions, clearances: number[], depthClearance: number) {
    await ready;
    const c = toleranceCoupon(pin, clearances, depthClearance);
    const all = [c.plate, ...c.pins];
    return Comlink.transfer(c, buffersOf(all));
  },
  /** X83: örnek figür. */
  async sample() {
    await ready;
    const m = sampleFigure();
    return Comlink.transfer(m, buffersOf([m]));
  },
  async split(mesh: LabeledMesh) {
    await ready;
    const pieces = splitComponents(mesh);
    return Comlink.transfer(pieces, buffersOf(pieces));
  },
};

export type GeometryApi = typeof api;

Comlink.expose(api);
