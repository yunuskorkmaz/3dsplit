import { connectedComponents } from './topology';
import type { LabeledMesh, MeshData } from './types';

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
 * Seçim sınırını yumuşatır (B6, basit sürüm): sınır bandındaki her üçgen,
 * `radius` mm içindeki alanın çoğunluğu seçimdeyse seçime girer, değilse çıkar.
 * Seçimdeki üçgenlerin maskesini döndürür.
 */
export function smoothSelection(
  adj: Int32Array,
  centroids: Float32Array,
  areas: Float32Array,
  selected: Uint8Array,
  radius: number,
  iterations = 2,
): Uint8Array {
  const triCount = selected.length;
  let cur = selected.slice();
  const r2 = radius * radius;
  const visitedMark = new Int32Array(triCount).fill(-1);
  for (let it = 0; it < iterations; it++) {
    // bant: sınıra radius içindeki üçgenler
    const band: number[] = [];
    const inBand = new Uint8Array(triCount);
    const seeds: number[] = [];
    for (let t = 0; t < triCount; t++) {
      for (let e = 0; e < 3; e++) {
        const n = adj[3 * t + e];
        if (n >= 0 && cur[n] !== cur[t]) {
          seeds.push(t);
          break;
        }
      }
    }
    for (const s of seeds) {
      if (inBand[s]) continue;
      const stack = [s];
      inBand[s] = 1;
      band.push(s);
      while (stack.length) {
        const t = stack.pop() as number;
        for (let e = 0; e < 3; e++) {
          const n = adj[3 * t + e];
          if (n < 0 || inBand[n]) continue;
          const dx = centroids[3 * n] - centroids[3 * s];
          const dy = centroids[3 * n + 1] - centroids[3 * s + 1];
          const dz = centroids[3 * n + 2] - centroids[3 * s + 2];
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          inBand[n] = 1;
          band.push(n);
          stack.push(n);
        }
      }
    }
    const next = cur.slice();
    for (const c of band) {
      // c etrafında radius içinde yüzey boyunca alan oyu
      let inside = 0;
      let total = 0;
      const stack = [c];
      visitedMark[c] = it * triCount + c;
      while (stack.length) {
        const t = stack.pop() as number;
        total += areas[t];
        if (cur[t]) inside += areas[t];
        for (let e = 0; e < 3; e++) {
          const n = adj[3 * t + e];
          if (n < 0 || visitedMark[n] === it * triCount + c) continue;
          const dx = centroids[3 * n] - centroids[3 * c];
          const dy = centroids[3 * n + 1] - centroids[3 * c + 1];
          const dz = centroids[3 * n + 2] - centroids[3 * c + 2];
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          visitedMark[n] = it * triCount + c;
          stack.push(n);
        }
      }
      next[c] = inside * 2 > total ? 1 : 0;
    }
    cur = next;
  }
  return cur;
}

/**
 * Bölge sınırındaki köşeleri yüzey boyunca kaydırarak sınır çizgisini
 * düzleştirir (B6). Sınır üçgen kenarlarından geçtiği için zikzak yapar;
 * her sınır köşesi, sınırdaki iki komşusunun ortasına doğru teğet düzlemde
 * çekilir. Üç bölgenin buluştuğu köşeler sabit kalır; bir üçgeni ters
 * çevirecek hareket geri alınır. Yeni konum dizisi döner.
 */
export function smoothBoundaryVertices(
  mesh: LabeledMesh,
  adj: Int32Array,
  slot: number,
  iterations = 6,
  strength = 0.5,
): Float32Array {
  const idx = mesh.indices;
  const labels = mesh.labels;
  const pos = new Float32Array(mesh.positions);
  const vCount = pos.length / 3;
  const triCount = labels.length;
  // sınır kenarları: bölge içi üçgenin kenarı, komşusu bölge dışı
  const nbA = new Int32Array(vCount).fill(-1);
  const nbB = new Int32Array(vCount).fill(-1);
  const deg = new Uint8Array(vCount);
  for (let t = 0; t < triCount; t++) {
    if (labels[t] !== slot) continue;
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n >= 0 && labels[n] === slot) continue;
      const a = idx[3 * t + e];
      const b = idx[3 * t + ((e + 1) % 3)];
      for (const [v, w] of [
        [a, b],
        [b, a],
      ]) {
        if (deg[v] === 0) nbA[v] = w;
        else if (deg[v] === 1) nbB[v] = w;
        deg[v] = Math.min(3, deg[v] + 1);
      }
    }
  }
  // köşe başına üçgenler (ters dönme kontrolü için) ve köşeye değen etiket sayısı
  const vtStart = new Uint32Array(vCount + 1);
  for (let i = 0; i < idx.length; i++) vtStart[idx[i] + 1]++;
  for (let v = 0; v < vCount; v++) vtStart[v + 1] += vtStart[v];
  const vtFill = vtStart.slice(0, vCount);
  const vtList = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) vtList[vtFill[idx[i]]++] = Math.floor(i / 3);
  const movable: number[] = [];
  for (let v = 0; v < vCount; v++) {
    if (deg[v] !== 2) continue;
    // üçten fazla bölgenin buluştuğu köşe sabit
    const seen = new Set<number>();
    for (let i = vtStart[v]; i < vtStart[v + 1]; i++) seen.add(labels[vtList[i]]);
    if (seen.size <= 2) movable.push(v);
  }
  const triNormal = (t: number, out: number[]) => {
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    out[0] = uy * vz - uz * vy;
    out[1] = uz * vx - ux * vz;
    out[2] = ux * vy - uy * vx;
  };
  const n0 = [0, 0, 0];
  const n1 = [0, 0, 0];
  for (let it = 0; it < iterations; it++) {
    for (const v of movable) {
      const a = nbA[v];
      const b = nbB[v];
      // köşe normali ve en kısa kenar (hareket sınırı)
      let nx = 0;
      let ny = 0;
      let nz = 0;
      let minEdge = Infinity;
      const before: number[][] = [];
      for (let i = vtStart[v]; i < vtStart[v + 1]; i++) {
        const t = vtList[i];
        triNormal(t, n0);
        before.push([n0[0], n0[1], n0[2]]);
        nx += n0[0];
        ny += n0[1];
        nz += n0[2];
        for (let k = 0; k < 3; k++) {
          const w = idx[3 * t + k];
          if (w === v) continue;
          minEdge = Math.min(minEdge, Math.hypot(pos[3 * w] - pos[3 * v], pos[3 * w + 1] - pos[3 * v + 1], pos[3 * w + 2] - pos[3 * v + 2]));
        }
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let dx = strength * ((pos[3 * a] + pos[3 * b]) / 2 - pos[3 * v]);
      let dy = strength * ((pos[3 * a + 1] + pos[3 * b + 1]) / 2 - pos[3 * v + 1]);
      let dz = strength * ((pos[3 * a + 2] + pos[3 * b + 2]) / 2 - pos[3 * v + 2]);
      // teğet düzleme izdüşür: şekil değişmesin
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx;
      dy -= dn * ny;
      dz -= dn * nz;
      const dl = Math.hypot(dx, dy, dz);
      const maxMove = 0.3 * minEdge;
      if (dl > maxMove) {
        dx *= maxMove / dl;
        dy *= maxMove / dl;
        dz *= maxMove / dl;
      }
      const ox = pos[3 * v];
      const oy = pos[3 * v + 1];
      const oz = pos[3 * v + 2];
      pos[3 * v] = ox + dx;
      pos[3 * v + 1] = oy + dy;
      pos[3 * v + 2] = oz + dz;
      // ters dönen veya çöken üçgen varsa geri al
      let ok = true;
      let k = 0;
      for (let i = vtStart[v]; i < vtStart[v + 1] && ok; i++, k++) {
        triNormal(vtList[i], n1);
        const b0 = before[k];
        const l0 = Math.hypot(b0[0], b0[1], b0[2]);
        const l1 = Math.hypot(n1[0], n1[1], n1[2]);
        if (l1 < l0 * 0.1 || (b0[0] * n1[0] + b0[1] * n1[1] + b0[2] * n1[2]) / (l0 * l1 || 1) < 0.5) ok = false;
      }
      if (!ok) {
        pos[3 * v] = ox;
        pos[3 * v + 1] = oy;
        pos[3 * v + 2] = oz;
      }
    }
  }
  return pos;
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
