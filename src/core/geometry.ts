import type { MeshData } from './types';

/** Üçgen başına birim normal (3 float) ve alan. */
export function faceNormalsAndAreas(mesh: MeshData): {
  normals: Float32Array;
  areas: Float32Array;
} {
  const { positions: p, indices: idx } = mesh;
  const triCount = idx.length / 3;
  const normals = new Float32Array(triCount * 3);
  const areas = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    areas[t] = len / 2;
    if (len > 0) {
      normals[3 * t] = nx / len;
      normals[3 * t + 1] = ny / len;
      normals[3 * t + 2] = nz / len;
    }
  }
  return { normals, areas };
}

export function faceCentroids(mesh: MeshData): Float32Array {
  const { positions: p, indices: idx } = mesh;
  const triCount = idx.length / 3;
  const out = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    for (let k = 0; k < 3; k++) out[3 * t + k] = (p[a + k] + p[b + k] + p[c + k]) / 3;
  }
  return out;
}

/** Kapalı mesh'in işaretli hacmi. Dışa bakan normallerde pozitif. */
export function signedVolume(mesh: MeshData, tris?: ArrayLike<number>): number {
  const { positions: p, indices: idx } = mesh;
  let vol = 0;
  const count = tris ? tris.length : idx.length / 3;
  for (let i = 0; i < count; i++) {
    const t = tris ? tris[i] : i;
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    vol +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return vol / 6;
}

export function boundingBox(positions: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/** Verilen üçgenlerin normal, alan ve ağırlık merkezini hazır dizilere yazar (yerinde güncelleme). */
export function writeFaceData(
  mesh: MeshData,
  tris: ArrayLike<number>,
  normals: Float32Array,
  areas: Float32Array,
  centroids: Float32Array,
): void {
  const { positions: p, indices: idx } = mesh;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    areas[t] = len / 2;
    normals[3 * t] = len > 0 ? nx / len : 0;
    normals[3 * t + 1] = len > 0 ? ny / len : 0;
    normals[3 * t + 2] = len > 0 ? nz / len : 0;
    for (let k = 0; k < 3; k++) centroids[3 * t + k] = (p[a + k] + p[b + k] + p[c + k]) / 3;
  }
}
