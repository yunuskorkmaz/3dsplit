import { connectedComponents } from './topology';
import type { MeshData } from './types';

/**
 * Smart Fill: tohum üçgenden BFS; komşu üçgene geçiş, iki yüz normali
 * arasındaki açı eşikten küçükse yapılır.
 */
export function smartFill(adj: Int32Array, normals: Float32Array, seed: number, maxAngleDeg: number): Uint32Array {
  const cosLimit = Math.cos((maxAngleDeg * Math.PI) / 180);
  const triCount = adj.length / 3;
  const visited = new Uint8Array(triCount);
  const out: number[] = [seed];
  visited[seed] = 1;
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || visited[n]) continue;
      const d = normals[3 * t] * normals[3 * n] + normals[3 * t + 1] * normals[3 * n + 1] + normals[3 * t + 2] * normals[3 * n + 2];
      if (d < cosLimit) continue;
      visited[n] = 1;
      out.push(n);
    }
  }
  return Uint32Array.from(out);
}

/** Bucket Fill: tohumla aynı etiketi taşıyan bağlı bölge. */
export function bucketFill(adj: Int32Array, labels: Uint16Array, seed: number): Uint32Array {
  const target = labels[seed];
  const visited = new Uint8Array(labels.length);
  const out: number[] = [seed];
  visited[seed] = 1;
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || visited[n] || labels[n] !== target) continue;
      visited[n] = 1;
      out.push(n);
    }
  }
  return Uint32Array.from(out);
}

/**
 * Brush: tıklanan üçgenden yüzey boyunca yayılır, ağırlık merkezi küre
 * içinde kalan üçgenleri döndürür. Yüzeyde gezdiği için ince duvarın
 * arkasını boyamaz.
 */
export function brushSelect(
  adj: Int32Array,
  centroids: Float32Array,
  seed: number,
  center: [number, number, number],
  radius: number,
): Uint32Array {
  const r2 = radius * radius;
  const triCount = adj.length / 3;
  const visited = new Uint8Array(triCount);
  const out: number[] = [seed];
  visited[seed] = 1;
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      const dx = centroids[3 * n] - center[0];
      const dy = centroids[3 * n + 1] - center[1];
      const dz = centroids[3 * n + 2] - center[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      out.push(n);
    }
  }
  return Uint32Array.from(out);
}

/**
 * Gap Fill: alanı eşikten küçük renk adalarını, en uzun ortak sınırı
 * paylaştıkları komşu etikete çevirir. Değişen üçgenleri ve yeni etiketleri döndürür.
 */
export function gapFill(
  mesh: MeshData,
  adj: Int32Array,
  labels: Uint16Array,
  areas: Float32Array,
  maxArea: number,
): { tris: Uint32Array; newLabels: Uint16Array } {
  const idx = mesh.indices;
  const p = mesh.positions;
  const triCount = labels.length;
  // aynı etiketli komşular arasında bileşen bul
  const sameLabelAdj = new Int32Array(adj.length);
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      sameLabelAdj[3 * t + e] = n >= 0 && labels[n] === labels[t] ? n : -1;
    }
  }
  const { component, count } = connectedComponents(triCount, sameLabelAdj);
  const islandArea = new Float64Array(count);
  for (let t = 0; t < triCount; t++) islandArea[component[t]] += areas[t];

  // küçük adalar için komşu etiket -> ortak sınır uzunluğu
  const borders = new Map<number, Map<number, number>>();
  for (let t = 0; t < triCount; t++) {
    const c = component[t];
    if (islandArea[c] >= maxArea) continue;
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || component[n] === c) continue;
      const a = idx[3 * t + e];
      const b = idx[3 * t + ((e + 1) % 3)];
      const len = Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2]);
      let m = borders.get(c);
      if (!m) {
        m = new Map();
        borders.set(c, m);
      }
      m.set(labels[n], (m.get(labels[n]) ?? 0) + len);
    }
  }
  const target = new Map<number, number>();
  for (const [c, m] of borders) {
    let best = -1;
    let bestLen = -1;
    for (const [label, len] of m) {
      if (len > bestLen) {
        best = label;
        bestLen = len;
      }
    }
    if (best >= 0) target.set(c, best);
  }
  const tris: number[] = [];
  const newLabels: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const l = target.get(component[t]);
    if (l === undefined || l === labels[t]) continue;
    tris.push(t);
    newLabels.push(l);
  }
  return { tris: Uint32Array.from(tris), newLabels: Uint16Array.from(newLabels) };
}
