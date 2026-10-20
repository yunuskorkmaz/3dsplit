import { faceNormalsAndAreas } from './geometry';
import { buildAdjacency } from './topology';
import type { MeshData } from './types';

export interface MeshTopology {
  adj: Int32Array;
  normals: Float32Array;
  areas: Float32Array;
}

/** Önbelleksiz hesap. Worker geometri anahtarıyla bunu saklar. */
export function computeMeshTopology(mesh: MeshData): MeshTopology {
  const { normals, areas } = faceNormalsAndAreas(mesh);
  return { adj: buildAdjacency(mesh), normals, areas };
}

const local = new WeakMap<MeshData, MeshTopology>();
let provider: ((mesh: MeshData) => MeshTopology) | null = null;

/**
 * Aynı mesh nesnesinde komşuluk ve normaller bir kez kurulur. Worker,
 * aktarılan her çağrıda nesne değiştiği için geometri anahtarıyla
 * `withMeshTopology` kurar (X68).
 */
export function meshTopology(mesh: MeshData): MeshTopology {
  if (provider) return provider(mesh);
  let topo = local.get(mesh);
  if (!topo) {
    topo = computeMeshTopology(mesh);
    local.set(mesh, topo);
  }
  return topo;
}

export function withMeshTopology<T>(next: (mesh: MeshData) => MeshTopology, fn: () => T): T {
  const prev = provider;
  provider = next;
  try {
    return fn();
  } finally {
    provider = prev;
  }
}
