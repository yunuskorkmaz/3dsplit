import { faceCentroids, faceNormalsAndAreas, writeFaceData } from '../core/geometry';
import { meanEdgeLength, triangleConcavity } from '../core/paint';
import { TriangleGrid } from '../core/spatial';
import { buildAdjacency, patchAdjacency } from '../core/topology';
import type { LabeledMesh } from '../core/types';

export interface Topology {
  adj: Int32Array;
  normals: Float32Array;
  areas: Float32Array;
  centroids: Float32Array;
  meanEdge: number;
}

const cache = new WeakMap<LabeledMesh, Topology>();

/** Boyama araçlarının ihtiyaç duyduğu komşuluk ve yüz bilgisi; mesh başına bir kez hesaplanır. */
export function topologyOf(mesh: LabeledMesh): Topology {
  let t = cache.get(mesh);
  if (!t) {
    const { normals, areas } = faceNormalsAndAreas(mesh);
    t = { adj: buildAdjacency(mesh), normals, areas, centroids: faceCentroids(mesh), meanEdge: meanEdgeLength(mesh) };
    cache.set(mesh, t);
  }
  return t;
}

const concavityCache = new WeakMap<LabeledMesh, Map<number, Float32Array>>();

/** Mesh ve ölçek başına içbükeylik haritası (Smart Fill vadiye oturtma için). */
export function concavityOf(mesh: LabeledMesh, scale: number): Float32Array {
  let byScale = concavityCache.get(mesh);
  if (!byScale) {
    byScale = new Map();
    concavityCache.set(mesh, byScale);
  }
  const key = Math.round(scale * 100) / 100;
  let c = byScale.get(key);
  if (!c) {
    const topo = topologyOf(mesh);
    c = triangleConcavity(mesh, topo.normals, topo.areas, key);
    byScale.set(key, c);
  }
  return c;
}

/**
 * Konumları değişen ama bağlantısı aynı kalan mesh için: komşuluk eski
 * mesh'ten alınır, yüz bilgileri yeniden hesaplanır (yumuşatma fırçası).
 */
export function refreshGeometry(mesh: LabeledMesh, from?: LabeledMesh, tris?: ArrayLike<number>): void {
  const prev = cache.get(from ?? mesh);
  if (prev && tris && !from) {
    // X38: sadece konumu değişen üçgenlerin yüz bilgisi
    writeFaceData(mesh, tris, prev.normals, prev.areas, prev.centroids);
    concavityCache.delete(mesh);
    gridCache.delete(mesh);
    return;
  }
  const adj = prev ? prev.adj : buildAdjacency(mesh);
  const { normals, areas } = faceNormalsAndAreas(mesh);
  cache.set(mesh, { adj, normals, areas, centroids: faceCentroids(mesh), meanEdge: meanEdgeLength(mesh) });
  concavityCache.delete(mesh);
  gridCache.delete(mesh);
}

/**
 * X38: üçgen bölme yerinde uygulandı; komşuluk ve yüz bilgileri sadece
 * değişen ve eklenen üçgenler için güncellenir (1.9M üçgende baştan kurmak
 * her darbede ~0.5 s sürüyordu). Önbellek yoksa bir şey yapılmaz.
 */
export function patchTopology(mesh: LabeledMesh, changed: ArrayLike<number>, firstAdded: number): void {
  const prev = cache.get(mesh);
  concavityCache.delete(mesh);
  gridCache.delete(mesh);
  if (!prev) return;
  const triCount = mesh.labels.length;
  const grow = (a: Float32Array, n: number) => {
    const out = new Float32Array(n);
    out.set(a.subarray(0, Math.min(a.length, n)));
    return out;
  };
  const normals = grow(prev.normals, 3 * triCount);
  const areas = grow(prev.areas, triCount);
  const centroids = grow(prev.centroids, 3 * triCount);
  const tris: number[] = Array.from(changed);
  for (let t = firstAdded; t < triCount; t++) tris.push(t);
  writeFaceData(mesh, tris, normals, areas, centroids);
  cache.set(mesh, { adj: patchAdjacency(prev.adj, mesh, changed, firstAdded), normals, areas, centroids, meanEdge: prev.meanEdge });
}

/** Mesh'in bağlantısı yerinde değişti (üçgen bölme): tüm önbellekler atılır. */
export function invalidateTopology(mesh: LabeledMesh): void {
  cache.delete(mesh);
  concavityCache.delete(mesh);
  gridCache.delete(mesh);
}

const gridCache = new WeakMap<LabeledMesh, TriangleGrid>();

/** En yakın üçgen araması için ızgara (ayna boyama). */
export function gridOf(mesh: LabeledMesh): TriangleGrid {
  let g = gridCache.get(mesh);
  if (!g) {
    const topo = topologyOf(mesh);
    g = new TriangleGrid(topo.centroids, topo.meanEdge * 2);
    gridCache.set(mesh, g);
  }
  return g;
}
