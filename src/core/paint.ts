import { connectedComponents } from './topology';
import type { MeshData } from './types';

export interface SmartFillOptions {
  /** Açı eşiği, derece. */
  maxAngleDeg: number;
  /**
   * Karşılaştırma ölçeği, mm. Aday üçgen, doldurma yolunda bu kadar geride
   * kalan üçgenle karşılaştırılır. Yoğun mesh'te kıvrım birçok üçgene
   * yayıldığı için komşu üçgen karşılaştırması eşiği hiç aşmaz.
   */
  scale: number;
  /** true: sadece içbükey (çukur) kıvrımlarda durur; tümsek tepelerinden geçer. */
  concaveOnly: boolean;
}

/**
 * Smart Fill: tohum üçgenden BFS. Aday üçgenin normali, yolda `scale` kadar
 * geride kalan atasının normaliyle karşılaştırılır; açı eşiği aşarsa
 * (concaveOnly'de: kıvrım içbükeyse ve eşiği aşarsa) geçilmez.
 */
export function smartFill(
  adj: Int32Array,
  normals: Float32Array,
  centroids: Float32Array,
  seed: number,
  opts: SmartFillOptions,
): Uint32Array {
  const cosLimit = Math.cos((opts.maxAngleDeg * Math.PI) / 180);
  const triCount = adj.length / 3;
  const visited = new Uint8Array(triCount);
  const parent = new Int32Array(triCount).fill(-1);
  const out: number[] = [seed];
  visited[seed] = 1;
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    // karşılaştırma yapılacak ata: t'den geriye, `scale` içinde kalan en uzak üçgen
    let a = t;
    while (parent[a] >= 0 && dist(centroids, parent[a], t) <= opts.scale) a = parent[a];
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || visited[n]) continue;
      const d = normals[3 * a] * normals[3 * n] + normals[3 * a + 1] * normals[3 * n + 1] + normals[3 * a + 2] * normals[3 * n + 2];
      if (d < cosLimit) {
        if (!opts.concaveOnly) continue;
        // kıvrımın yönü yerel kenardan okunur: aday, t'nin teğet düzleminin üstündeyse içbükey.
        // Atanın düzlemi kullanılmaz; ata köşenin öbür yüzünde kalabiliyor.
        const up =
          normals[3 * t] * (centroids[3 * n] - centroids[3 * t]) +
          normals[3 * t + 1] * (centroids[3 * n + 1] - centroids[3 * t + 1]) +
          normals[3 * t + 2] * (centroids[3 * n + 2] - centroids[3 * t + 2]);
        if (up > 0) continue;
      }
      visited[n] = 1;
      parent[n] = t;
      out.push(n);
    }
  }
  return Uint32Array.from(out);
}

function dist(c: Float32Array, a: number, b: number): number {
  return Math.hypot(c[3 * a] - c[3 * b], c[3 * a + 1] - c[3 * b + 1], c[3 * a + 2] - c[3 * b + 2]);
}

/** Ortalama kenar uzunluğu; Smart Fill ölçeğinin otomatik değeri için. */
export function meanEdgeLength(mesh: MeshData): number {
  const { positions: p, indices: idx } = mesh;
  let total = 0;
  for (let i = 0; i < idx.length; i++) {
    const a = 3 * idx[i];
    const b = 3 * idx[i % 3 === 2 ? i - 2 : i + 1];
    total += Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
  }
  return idx.length ? total / idx.length : 0;
}

/**
 * Seçimin içinde kalan delikleri (seçimle çevrili, seçilmemiş küçük alanlar)
 * seçime katar. Seçime komşu tümleyen bileşenlerden en büyüğü "dış" sayılır;
 * diğerleri seçimden küçükse delik kabul edilir.
 */
export function closeHoles(
  adj: Int32Array,
  areas: Float32Array,
  tris: ArrayLike<number>,
  opts: { maxHoleFraction?: number; accept?: (t: number) => boolean } = {},
): { tris: number[]; holes: number } {
  const triCount = areas.length;
  const complement = new Uint8Array(triCount).fill(1);
  let selArea = 0;
  for (let i = 0; i < tris.length; i++) {
    complement[tris[i]] = 0;
    selArea += areas[tris[i]];
  }
  const out = Array.from(tris);
  const { component, count } = connectedComponents(triCount, adj, complement);
  const touching = new Set<number>();
  for (const t of out) {
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n >= 0 && component[n] >= 0) touching.add(component[n]);
    }
  }
  if (touching.size <= 1) return { tris: out, holes: 0 };
  const compArea = new Float64Array(count);
  for (let t = 0; t < triCount; t++) if (component[t] >= 0) compArea[component[t]] += areas[t];
  let outside = -1;
  for (const c of touching) if (outside < 0 || compArea[c] > compArea[outside]) outside = c;
  const maxArea = selArea * (opts.maxHoleFraction ?? 1);
  const holeSet = new Set<number>();
  for (const c of touching) if (c !== outside && compArea[c] < maxArea) holeSet.add(c);
  if (opts.accept) {
    // kabul edilmeyen üçgen içeren delik (ör. başka slota boyanmış) açık kalır
    for (let t = 0; t < triCount; t++) if (holeSet.has(component[t]) && !opts.accept(t)) holeSet.delete(component[t]);
  }
  for (let t = 0; t < triCount; t++) if (component[t] >= 0 && holeSet.has(component[t])) out.push(t);
  return { tris: out, holes: holeSet.size };
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
