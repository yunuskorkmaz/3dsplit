import type { LabeledMesh, MeshData } from './types';

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

/** X71: baskı boyu bu aralığın dışındaysa uyarılır, mm. */
export const PRINT_SIZE_MAX = 250;
export const PRINT_SIZE_MIN = 8;

/** Parçaların ortak sınır kutusunun en uzun kenarı. */
export function longestExtent(meshes: MeshData[]): number {
  const { min, max } = unionBox(meshes);
  return Math.max(0, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}

/** X80: parça başına en uzun kenarların en büyüğü (plakaya dağılmış parçalar toplanmaz). */
export function largestExtent(meshes: MeshData[]): number {
  let best = 0;
  for (const m of meshes) best = Math.max(best, longestExtent([m]));
  return best;
}

/** X80: hacmi en büyük parçanın sırası; liste boşsa -1. */
export function largestPart(meshes: MeshData[]): number {
  let best = -1;
  let volume = -Infinity;
  meshes.forEach((m, i) => {
    const v = Math.abs(signedVolume(m));
    if (v > volume) {
      volume = v;
      best = i;
    }
  });
  return best;
}

export function sizeWarning(extent: number): 'large' | 'small' | null {
  if (extent > PRINT_SIZE_MAX) return 'large';
  if (extent < PRINT_SIZE_MIN) return 'small';
  return null;
}

/**
 * X71: parçaları ortak kutunun merkezi çevresinde `factor` ile büyütür.
 * Yeni mesh nesneleri döner; önbellekler ve geri al kayıtları eski nesnelerde kalır.
 */
export function scaleMeshes(meshes: LabeledMesh[], factor: number): LabeledMesh[] {
  const { min, max } = unionBox(meshes);
  const c = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  return meshes.map((m) => {
    const positions = new Float32Array(m.positions.length);
    for (let i = 0; i < positions.length; i++) {
      const k = i % 3;
      positions[i] = c[k] + (m.positions[i] - c[k]) * factor;
    }
    return {
      positions,
      indices: m.indices.slice(),
      labels: m.labels.slice(),
      ...(m.cut ? { cut: m.cut.slice() } : {}),
    };
  });
}

function unionBox(meshes: MeshData[]): ReturnType<typeof boundingBox> {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const b = boundingBox(m.positions);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], b.min[k]);
      max[k] = Math.max(max[k], b.max[k]);
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
