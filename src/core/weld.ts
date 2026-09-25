import { boundingBox } from './geometry';
import type { MeshData } from './types';

/**
 * Aynı konumdaki köşeleri birleştirir. STL gibi üçgen çorbası girdiler için.
 * `indices` verilmezse `positions` ardışık üçlüler olarak okunur.
 * Tolerans, sınır kutusu köşegeninin oranı olarak verilir.
 */
export function weldVertices(
  positions: Float32Array,
  indices?: Uint32Array,
  relTolerance = 1e-6,
): MeshData {
  const srcIdx = indices ?? sequentialIndices(positions.length / 3);
  const { min, max } = boundingBox(positions);
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const inv = 1 / (diag * relTolerance);
  const map = new Map<string, number>();
  const remap = new Uint32Array(positions.length / 3);
  const out: number[] = [];
  for (let v = 0; v < remap.length; v++) {
    const x = positions[3 * v];
    const y = positions[3 * v + 1];
    const z = positions[3 * v + 2];
    const key = `${Math.round((x - min[0]) * inv)},${Math.round((y - min[1]) * inv)},${Math.round((z - min[2]) * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      map.set(key, id);
      out.push(x, y, z);
    }
    remap[v] = id;
  }
  const newIdx = new Uint32Array(srcIdx.length);
  for (let i = 0; i < srcIdx.length; i++) newIdx[i] = remap[srcIdx[i]];
  return { positions: new Float32Array(out), indices: newIdx };
}

function sequentialIndices(n: number): Uint32Array {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  return idx;
}
