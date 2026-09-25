import { faceCentroids, faceNormalsAndAreas } from './geometry';
import { cleanSelection } from './paint';
import { boundaryLoops } from './topology';
import type { LabeledMesh } from './types';

/**
 * B6: bölge sınırını düzgün bir eğriye oturtur, alanı korur.
 *
 * 1. Bölgenin sınır halkaları çıkarılır ve Taubin (λ/μ) ile yumuşatılır.
 *    Taubin, düz Laplace'ın aksine kapalı eğriyi büzmez: sınır içe ya da
 *    dışa kaymaz, sadece `radius`'tan küçük girinti/çıkıntılar gider.
 * 2. Eğrinin yakınındaki her üçgen, eğrinin hangi tarafında kaldığına göre
 *    bölgeye girer ya da çıkar (içe/dışa kararı eğriden okunur).
 * 3. Yeni sınırdaki köşeler yüzey üzerinde eğrinin üstüne çekilir; sınır
 *    üçgen boyutundan bağımsız olarak düz görünür. Şekil değişmez (teğet hareket).
 *
 * `accept`: bölgeye katılabilecek üçgenler (ör. başka slota boyanmışlar hariç).
 * `outsideLabel`: bölgeden çıkan üçgenin alacağı etiket.
 */
export function smoothRegionBoundary(
  mesh: LabeledMesh,
  adj: Int32Array,
  slot: number,
  radius: number,
  accept: (t: number) => boolean,
  outsideLabel: (t: number) => number,
): { labels: Uint16Array; positions: Float32Array } {
  const labels = Uint16Array.from(mesh.labels);
  const positions = new Float32Array(mesh.positions);
  const triCount = labels.length;
  const mask = Uint8Array.from(labels, (l) => (l === slot ? 1 : 0));
  const loops = boundaryLoops(mesh, adj, mask).filter((l) => l.length >= 6);
  if (!loops.length) return { labels, positions };

  const curves = loops.map((loop) =>
    gaussianSmooth(
      loop.map((v) => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]]),
      radius,
    ),
  );
  const band = radius * 1.5 + meanSegment(curves) * 2;
  // hücre = bant: her sorgu en fazla 27 hücreye bakar
  const index = new SegmentIndex(curves, band);
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const c of curves) {
    for (const p of c) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k] - band);
        hi[k] = Math.max(hi[k], p[k] + band);
      }
    }
  }

  // 2. eğri yakınındaki üçgenleri eğriye göre işaretli mesafeleriyle etiketle
  const { normals, areas } = faceNormalsAndAreas(mesh);
  const centroids = faceCentroids(mesh);
  let areaBefore = 0;
  let perimeter = 0;
  for (let t = 0; t < triCount; t++) if (labels[t] === slot) areaBefore += areas[t];
  for (const c of curves) perimeter += meanSegment([c]) * c.length;
  // bant içindeki üçgenler: işaretli mesafe (+ bölge tarafı)
  const bandTris: number[] = [];
  const signed: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const c: V3 = [centroids[3 * t], centroids[3 * t + 1], centroids[3 * t + 2]];
    if (c[0] < lo[0] || c[1] < lo[1] || c[2] < lo[2] || c[0] > hi[0] || c[1] > hi[1] || c[2] > hi[2]) continue;
    const hit = index.closest(c, band);
    if (!hit) continue;
    const n: V3 = [normals[3 * t], normals[3 * t + 1], normals[3 * t + 2]];
    // halka yönünde bölge solda kalır: sol = normal × teğet
    const left = cross(n, hit.tangent);
    bandTris.push(t);
    signed.push(dot(sub(c, hit.point), left));
  }
  // Gauss eğriyi büzer: sınır, bölge alanı eskisine eşit olacak kadar dışa (offset) kaydırılır
  const inside = (i: number, offset: number) => signed[i] > -offset;
  const areaWith = (offset: number) => {
    let a = areaBefore;
    for (let i = 0; i < bandTris.length; i++) {
      const t = bandTris[i];
      const was = labels[t] === slot;
      const now = inside(i, offset) ? was || accept(t) : false;
      if (was && !now) a -= areas[t];
      else if (!was && now) a += areas[t];
    }
    return a;
  };
  let offset = 0;
  for (let it = 0; it < 3; it++) offset += (areaBefore - areaWith(offset)) / Math.max(perimeter, 1e-6);
  offset = Math.max(-radius, Math.min(radius, offset));
  for (let i = 0; i < bandTris.length; i++) {
    const t = bandTris[i];
    if (inside(i, offset)) {
      if (labels[t] !== slot && accept(t)) labels[t] = slot;
    } else if (labels[t] === slot) {
      labels[t] = outsideLabel(t);
    }
  }
  // kırıntı ve delik temizliği
  const newMask = Uint8Array.from(labels, (l) => (l === slot ? 1 : 0));
  const cleaned = cleanSelection(adj, areas, newMask, { minArea: 1, accept: (t) => labels[t] === slot || accept(t) });
  for (let t = 0; t < triCount; t++) {
    if (cleaned[t] && labels[t] !== slot) labels[t] = slot;
    else if (!cleaned[t] && labels[t] === slot) labels[t] = outsideLabel(t);
  }

  // 3. yeni sınır köşelerini eğriye çek
  snapBoundaryToCurves({ positions, indices: mesh.indices, labels }, adj, slot, index, band, offset);
  return { labels, positions };
}

type V3 = [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function meanSegment(curves: V3[][]): number {
  let sum = 0;
  let n = 0;
  for (const c of curves) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      sum += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Kapalı çizgiyi yay uzunluğu boyunca Gauss çekirdeğiyle yumuşatır
 * (σ = `sigma` mm). Düzensiz nokta aralığında da aynı ölçekte çalışır.
 * Eğriyi biraz büzer; bu, etiketlemede alan dengesiyle telafi edilir.
 */
function gaussianSmooth(points: V3[], sigma: number): V3[] {
  const n = points.length;
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    seg.push(d);
    total += d;
  }
  // σ çevreye göre çok büyükse (küçük halka) sınırla: halka noktaya çökmesin
  const s = Math.min(sigma, total / 6);
  const reach = 3 * s;
  const inv = 1 / (2 * s * s);
  return points.map((_, i) => {
    let wx = 0;
    let wy = 0;
    let wz = 0;
    let wsum = 1;
    wx += points[i][0];
    wy += points[i][1];
    wz += points[i][2];
    // ileri ve geri yönde yay uzunluğu reach'e kadar
    for (const dir of [1, -1]) {
      let arc = 0;
      let j = i;
      for (let k = 0; k < n - 1; k++) {
        const step = dir > 0 ? seg[j] : seg[(j + n - 1) % n];
        j = (j + dir + n) % n;
        arc += step;
        if (arc > reach) break;
        const w = Math.exp(-arc * arc * inv);
        wx += points[j][0] * w;
        wy += points[j][1] * w;
        wz += points[j][2] * w;
        wsum += w;
      }
    }
    return [wx / wsum, wy / wsum, wz / wsum] as V3;
  });
}

/** Eğri parçaları için ızgara: bir noktaya en yakın parça, teğeti ve noktası. */
class SegmentIndex {
  private cells = new Map<string, [number, number][]>();
  constructor(
    private curves: V3[][],
    private cell: number,
  ) {
    curves.forEach((c, ci) => {
      for (let i = 0; i < c.length; i++) {
        const a = c[i];
        const b = c[(i + 1) % c.length];
        // parçanın kapladığı hücrelerin hepsine ekle
        const lo = [0, 1, 2].map((k) => Math.floor(Math.min(a[k], b[k]) / cell));
        const hi = [0, 1, 2].map((k) => Math.floor(Math.max(a[k], b[k]) / cell));
        for (let x = lo[0]; x <= hi[0]; x++) {
          for (let y = lo[1]; y <= hi[1]; y++) {
            for (let z = lo[2]; z <= hi[2]; z++) {
              const key = `${x},${y},${z}`;
              const list = this.cells.get(key);
              if (list) list.push([ci, i]);
              else this.cells.set(key, [[ci, i]]);
            }
          }
        }
      }
    });
  }

  closest(p: V3, maxDist: number): { point: V3; tangent: V3; dist: number } | null {
    const r = Math.ceil(maxDist / this.cell);
    const cx = Math.floor(p[0] / this.cell);
    const cy = Math.floor(p[1] / this.cell);
    const cz = Math.floor(p[2] / this.cell);
    let best: { point: V3; tangent: V3; dist: number } | null = null;
    for (let x = cx - r; x <= cx + r; x++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let z = cz - r; z <= cz + r; z++) {
          const list = this.cells.get(`${x},${y},${z}`);
          if (!list) continue;
          for (const [ci, i] of list) {
            const c = this.curves[ci];
            const a = c[i];
            const b = c[(i + 1) % c.length];
            const ab = sub(b, a);
            const len2 = dot(ab, ab) || 1e-12;
            const s = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
            const q: V3 = [a[0] + ab[0] * s, a[1] + ab[1] * s, a[2] + ab[2] * s];
            const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
            if (d <= maxDist && (!best || d < best.dist)) {
              const l = Math.sqrt(len2);
              best = { point: q, tangent: [ab[0] / l, ab[1] / l, ab[2] / l], dist: d };
            }
          }
        }
      }
    }
    return best;
  }
}

/**
 * Bölge sınırındaki köşeleri eğrinin en yakın noktasına doğru, teğet
 * düzlemde ve üçgenleri ters çevirmeden kaydırır.
 */
function snapBoundaryToCurves(
  mesh: LabeledMesh,
  adj: Int32Array,
  slot: number,
  index: SegmentIndex,
  band: number,
  offset: number,
): void {
  const { indices: idx, labels } = mesh;
  const pos = mesh.positions;
  const vCount = pos.length / 3;
  const triCount = labels.length;
  const onBoundary = new Uint8Array(vCount);
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || (labels[t] === slot) === (labels[n] === slot)) continue;
      onBoundary[idx[3 * t + e]] = 1;
      onBoundary[idx[3 * t + ((e + 1) % 3)]] = 1;
    }
  }
  // köşe -> üçgenler
  const start = new Uint32Array(vCount + 1);
  for (let i = 0; i < idx.length; i++) start[idx[i] + 1]++;
  for (let v = 0; v < vCount; v++) start[v + 1] += start[v];
  const fill = start.slice(0, vCount);
  const list = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) list[fill[idx[i]]++] = Math.floor(i / 3);
  const verts: number[] = [];
  for (let v = 0; v < vCount; v++) {
    if (!onBoundary[v]) continue;
    const seen = new Set<number>();
    for (let i = start[v]; i < start[v + 1]; i++) seen.add(labels[list[i]]);
    // üç bölgenin buluştuğu köşe sabit kalır
    if (seen.size <= 2) verts.push(v);
  }
  const triNormal = (t: number): V3 => {
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    const u: V3 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const w: V3 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    return cross(u, w);
  };
  for (let it = 0; it < 10; it++) {
    for (const v of verts) {
      const p: V3 = [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
      const hit = index.closest(p, band);
      if (!hit) continue;
      const before: V3[] = [];
      let n: V3 = [0, 0, 0];
      let minEdge = Infinity;
      for (let i = start[v]; i < start[v + 1]; i++) {
        const t = list[i];
        const tn = triNormal(t);
        before.push(tn);
        n = [n[0] + tn[0], n[1] + tn[1], n[2] + tn[2]];
        for (let k = 0; k < 3; k++) {
          const w = idx[3 * t + k];
          if (w !== v) minEdge = Math.min(minEdge, Math.hypot(pos[3 * w] - p[0], pos[3 * w + 1] - p[1], pos[3 * w + 2] - p[2]));
        }
      }
      const nl = Math.hypot(...n) || 1;
      n = [n[0] / nl, n[1] / nl, n[2] / nl];
      // hedef: eğrinin offset kadar dışı (bölge solda: dış = -sol)
      const left = cross(n, hit.tangent);
      const target: V3 = [hit.point[0] - offset * left[0], hit.point[1] - offset * left[1], hit.point[2] - offset * left[2]];
      let d = sub(target, p);
      const dn = dot(d, n);
      d = [d[0] - dn * n[0], d[1] - dn * n[1], d[2] - dn * n[2]];
      const dl = Math.hypot(...d);
      const maxMove = 0.45 * minEdge;
      if (dl > maxMove) d = [(d[0] * maxMove) / dl, (d[1] * maxMove) / dl, (d[2] * maxMove) / dl];
      pos[3 * v] = p[0] + d[0];
      pos[3 * v + 1] = p[1] + d[1];
      pos[3 * v + 2] = p[2] + d[2];
      let ok = true;
      let k = 0;
      for (let i = start[v]; i < start[v + 1] && ok; i++, k++) {
        const b0 = before[k];
        const b1 = triNormal(list[i]);
        const l0 = Math.hypot(...b0);
        const l1 = Math.hypot(...b1);
        // üçgen çok incelmesin (gölgelemede diken gibi görünür), yönü fazla dönmesin
        if (l1 < l0 * 0.3 || dot(b0, b1) / (l0 * l1 || 1) < 0.9) ok = false;
      }
      if (!ok) {
        pos[3 * v] = p[0];
        pos[3 * v + 1] = p[1];
        pos[3 * v + 2] = p[2];
      }
    }
  }
}
