import { faceCentroids, faceNormalsAndAreas } from '../core/geometry';
import { buildAdjacency } from '../core/topology';
import type { LabeledMesh } from '../core/types';

export interface Topology {
  adj: Int32Array;
  normals: Float32Array;
  areas: Float32Array;
  centroids: Float32Array;
}

const cache = new WeakMap<LabeledMesh, Topology>();

/** Boyama araçlarının ihtiyaç duyduğu komşuluk ve yüz bilgisi; mesh başına bir kez hesaplanır. */
export function topologyOf(mesh: LabeledMesh): Topology {
  let t = cache.get(mesh);
  if (!t) {
    const { normals, areas } = faceNormalsAndAreas(mesh);
    t = { adj: buildAdjacency(mesh), normals, areas, centroids: faceCentroids(mesh) };
    cache.set(mesh, t);
  }
  return t;
}
