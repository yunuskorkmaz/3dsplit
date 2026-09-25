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

/** Otomatik ölçekte denenen ölçekler (ortalama kenar uzunluğunun katı). */
export const AUTO_SCALE_MULTIPLES = [3, 4, 6, 8, 12, 16];

/**
 * Smart Fill ölçeğini tıklanan özelliğe göre seçer. Ölçekler küçükten
 * büyüğe denenir; modelin `leakFraction`'ından azını kaplayan ve sonraki iki
 * ölçekten biriyle benzer alan veren (kararlı) ilk ölçek seçilir. Hiçbiri
 * kararlı değilse taşmayan ilk ölçek, o da yoksa en küçük ölçek döner.
 */
export function chooseSmartScale(
  adj: Int32Array,
  normals: Float32Array,
  centroids: Float32Array,
  areas: Float32Array,
  seed: number,
  meanEdge: number,
  opts: Omit<SmartFillOptions, 'scale'>,
  leakFraction = 0.4,
): { scale: number; tris: Uint32Array; leaked: boolean } {
  let total = 0;
  for (let t = 0; t < areas.length; t++) total += areas[t];
  const results: { scale: number; tris: Uint32Array; area: number }[] = [];
  const run = (i: number) => {
    if (!results[i]) {
      const scale = meanEdge * AUTO_SCALE_MULTIPLES[i];
      const tris = smartFill(adj, normals, centroids, seed, { ...opts, scale });
      let area = 0;
      for (let k = 0; k < tris.length; k++) area += areas[tris[k]];
      results[i] = { scale, tris, area };
    }
    return results[i];
  };
  const limit = total * leakFraction;
  let firstOk = -1;
  for (let i = 0; i < AUTO_SCALE_MULTIPLES.length; i++) {
    const r = run(i);
    if (r.area >= limit) continue;
    if (firstOk < 0) firstOk = i;
    for (let j = i + 1; j <= i + 2 && j < AUTO_SCALE_MULTIPLES.length; j++) {
      const n = run(j);
      if (Math.abs(n.area - r.area) <= r.area * 0.25) return { scale: r.scale, tris: r.tris, leaked: false };
    }
  }
  if (firstOk >= 0) return { ...results[firstOk], leaked: false };
  return { ...run(0), leaked: true };
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

/** Köşe komşuluğu (CSR): `start[v]..start[v+1]` aralığında `list` içindeki komşular. */
export function vertexNeighbors(mesh: MeshData): { start: Uint32Array; list: Uint32Array } {
  const vCount = mesh.positions.length / 3;
  const idx = mesh.indices;
  const deg = new Uint32Array(vCount + 1);
  for (let i = 0; i < idx.length; i++) deg[idx[i]] += 2;
  const start = new Uint32Array(vCount + 1);
  for (let v = 0; v < vCount; v++) start[v + 1] = start[v] + deg[v];
  const fill = start.slice(0, vCount);
  const list = new Uint32Array(start[vCount]);
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k];
      list[fill[a]++] = idx[t + ((k + 1) % 3)];
      list[fill[a]++] = idx[t + ((k + 2) % 3)];
    }
  }
  // her kenar iki kez yazılır; tekrarlar ortalamayı değiştirmez
  return { start, list };
}

/**
 * Üçgen başına içbükeylik: pozitif değer çukur/vadi, negatif tümsek.
 * Köşede Laplace vektörünün normal bileşeni, `scale` mm'ye kadar yayılarak
 * yumuşatılır (gürültü değil biçim okunur).
 */
export function triangleConcavity(mesh: MeshData, normals: Float32Array, areas: Float32Array, scale: number): Float32Array {
  const p = mesh.positions;
  const idx = mesh.indices;
  const vCount = p.length / 3;
  const { start, list } = vertexNeighbors(mesh);
  // köşe normalleri (alan ağırlıklı)
  const vn = new Float32Array(vCount * 3);
  for (let t = 0; t < idx.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      for (let c = 0; c < 3; c++) vn[3 * v + c] += normals[3 * t + c] * areas[t];
    }
  }
  let h: Float32Array = new Float32Array(vCount);
  let edgeSum = 0;
  let edgeCount = 0;
  for (let v = 0; v < vCount; v++) {
    const n0 = vn[3 * v];
    const n1 = vn[3 * v + 1];
    const n2 = vn[3 * v + 2];
    const nl = Math.hypot(n0, n1, n2) || 1;
    let mx = 0;
    let my = 0;
    let mz = 0;
    const s = start[v];
    const e = start[v + 1];
    for (let i = s; i < e; i++) {
      const u = list[i];
      mx += p[3 * u];
      my += p[3 * u + 1];
      mz += p[3 * u + 2];
      edgeSum += Math.hypot(p[3 * u] - p[3 * v], p[3 * u + 1] - p[3 * v + 1], p[3 * u + 2] - p[3 * v + 2]);
      edgeCount++;
    }
    const cnt = Math.max(1, e - s);
    const lx = mx / cnt - p[3 * v];
    const ly = my / cnt - p[3 * v + 1];
    const lz = mz / cnt - p[3 * v + 2];
    h[v] = (lx * n0 + ly * n1 + lz * n2) / nl;
  }
  const meanEdge = edgeCount ? edgeSum / edgeCount : 1;
  for (let v = 0; v < vCount; v++) h[v] /= meanEdge;
  // difüzyon: yaklaşık (scale / kenar)^2 adım yarıçapı scale'e yayar; üst sınırla
  const steps = Math.min(40, Math.max(1, Math.round((scale / meanEdge) ** 2 / 2)));
  let next: Float32Array = new Float32Array(vCount);
  for (let it = 0; it < steps; it++) {
    for (let v = 0; v < vCount; v++) {
      let sum = h[v];
      const s = start[v];
      const e = start[v + 1];
      for (let i = s; i < e; i++) sum += h[list[i]];
      next[v] = sum / (1 + e - s);
    }
    [h, next] = [next, h];
  }
  const out = new Float32Array(idx.length / 3);
  for (let t = 0; t < out.length; t++) out[t] = (h[idx[3 * t]] + h[idx[3 * t + 1]] + h[idx[3 * t + 2]]) / 3;
  return out;
}

/** Küçük ikili yığın (öncelik kuyruğu), anahtar küçük olan önce. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.keys;
    const v = this.vals;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop() as number;
    const lv = v.pop() as number;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Seçim sınırını çıkıntının dibindeki vadi çizgisine oturtur (işaretleyicili
 * havza). Sınırın `band` mm yakınındaki üçgenler belirsiz sayılır; seçimin
 * derini "iç", dışarının uzağı "dış" işaretleyicidir. İki havza içbükeylik
 * haritası üzerinde en düşükten başlayarak taşar ve vadide (içbükeyliğin en
 * yüksek olduğu çizgide) buluşur. Eksik seçim genişler, taşan seçim geri çekilir.
 */
export function refineToValley(
  adj: Int32Array,
  centroids: Float32Array,
  concavity: Float32Array,
  selected: Uint8Array,
  band: number,
): Uint8Array {
  const triCount = selected.length;
  // sınıra geodezik mesafe (üçgen merkezleri üzerinden Dijkstra)
  // Float64: yığındaki anahtar float64, Float32 yuvarlaması "d > dist" kontrolünü bozuyor
  const dist = new Float64Array(triCount).fill(Infinity);
  const heap = new MinHeap();
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n >= 0 && selected[n] !== selected[t]) {
        dist[t] = 0;
        heap.push(0, t);
        break;
      }
    }
  }
  const step = (a: number, b: number) =>
    Math.hypot(centroids[3 * a] - centroids[3 * b], centroids[3 * a + 1] - centroids[3 * b + 1], centroids[3 * a + 2] - centroids[3 * b + 2]);
  while (heap.size) {
    const [d, t] = heap.pop();
    if (d > dist[t] || d > band * 1.5) continue;
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0) continue;
      const nd = d + step(t, n);
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  // iç işaretleyici: seçimin sınırdan en az band uzağı; seçim ince ise en derin yarısı
  let innerDepth = band;
  let maxInner = 0;
  for (let t = 0; t < triCount; t++) if (selected[t] && Number.isFinite(dist[t])) maxInner = Math.max(maxInner, dist[t]);
  let anyDeep = false;
  for (let t = 0; t < triCount; t++) if (selected[t] && !(dist[t] < band)) anyDeep = true;
  if (!anyDeep) innerDepth = maxInner * 0.5;

  const label = new Int8Array(triCount); // 1 iç, -1 dış, 0 belirsiz
  for (let t = 0; t < triCount; t++) {
    if (selected[t]) label[t] = dist[t] >= innerDepth ? 1 : 0;
    else label[t] = dist[t] > band ? -1 : 0;
  }
  // taşırma: belirsiz komşuları içbükeyliğe göre sırala
  const flood = new MinHeap();
  const from = new Int8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    if (label[t] === 0) continue;
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n >= 0 && label[n] === 0 && from[n] === 0) {
        from[n] = label[t];
        flood.push(concavity[n], n);
      }
    }
  }
  while (flood.size) {
    const [, t] = flood.pop();
    if (label[t] !== 0) continue;
    label[t] = from[t];
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n >= 0 && label[n] === 0 && from[n] === 0) {
        from[n] = label[t];
        flood.push(concavity[n], n);
      }
    }
  }
  const out = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) out[t] = label[t] === 1 || (label[t] === 0 && selected[t]) ? 1 : 0;
  return out;
}

/**
 * Seçim maskesini temizler: `keepSeed` verilirse sadece onun bağlı olduğu
 * parça, verilmezse `minArea`'dan büyük parçalar kalır; ardından seçimin
 * içindeki küçük delikler (`accept` edilen üçgenlerden oluşan) kapatılır.
 */
export function cleanSelection(
  adj: Int32Array,
  areas: Float32Array,
  mask: Uint8Array,
  opts: { keepSeed?: number; minArea?: number; accept?: (t: number) => boolean } = {},
): Uint8Array {
  const triCount = mask.length;
  const { component, count } = connectedComponents(triCount, adj, mask);
  const compArea = new Float64Array(count);
  for (let t = 0; t < triCount; t++) if (component[t] >= 0) compArea[component[t]] += areas[t];
  const keep = new Uint8Array(count);
  if (opts.keepSeed !== undefined && component[opts.keepSeed] >= 0) {
    keep[component[opts.keepSeed]] = 1;
  } else {
    const largest = Math.max(0, ...compArea);
    const minArea = opts.minArea ?? 1;
    for (let c = 0; c < count; c++) if (compArea[c] >= minArea || compArea[c] >= largest * 0.5) keep[c] = 1;
  }
  const tris: number[] = [];
  for (let t = 0; t < triCount; t++) if (component[t] >= 0 && keep[component[t]]) tris.push(t);
  const closed = closeHoles(adj, areas, tris, { maxHoleFraction: 0.05, accept: opts.accept });
  const out = new Uint8Array(triCount);
  for (const t of closed.tris) out[t] = 1;
  return out;
}
