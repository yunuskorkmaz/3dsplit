import { faceCentroids, faceNormalsAndAreas } from '../core/geometry';
import { meanEdgeLength, triangleConcavity } from '../core/paint';
import { buildAdjacency } from '../core/topology';
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
