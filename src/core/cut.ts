import type { Manifold } from 'manifold-3d';
import { faceNormalsAndAreas } from './geometry';
import { closeHoles } from './paint';
import { CUT_FACE_ID, fromManifold, KernelError, kernel, Scope, toManifold } from './kernel';
import { boundaryLoops, buildAdjacency, connectedComponents, extractTriangles } from './topology';
import { BASE_SLOT, type LabeledMesh, type MeshData, type Vec3 } from './types';
import { add, cross, dot, normalize, orthoBasis, scale, sub, vertexAt } from './vec';

export type CutMode = 'fast' | 'socket' | 'keys';
export type PinShape = 'cylinder' | 'cube' | 'octagon';

export interface PinOptions {
  shape: PinShape;
  /** Pim yarıçapı (küpte yarı genişlik), mm. */
  radius: number;
  /** Pimin toplam boyu, mm. Yarısı parçada, yarısı karşı tarafta kalır. */
  length: number;
  /** true: pim kesilen parçada, yuva gövdede. */
  onPart: boolean;
}

/** Tek bir pimin yeri ve (isteğe bağlı) kendine özgü boyutu/ekseni. */
export interface PinPlacement {
  /** Yüzeyde tıklanan nokta; kapak yüzeyine izdüşürülür. */
  point: Vec3;
  radius?: number;
  length?: number;
  /** Pimin ekseni (herhangi bir yönde verilebilir; gövdeye bakacak şekilde çevrilir). */
  axis?: Vec3;
}

export interface CutOptions {
  mode: CutMode;
  slot: number;
  /** Socket: tapanın yüzeyden içeri uzandığı derinlik, mm. */
  depth: number;
  /** Tapa/yuva ve pim/yuva arasındaki boşluk, mm. */
  clearance: number;
  /** Socket: tapa tabanının içe daralma oranı (0 düz, 0.5 taban yarı genişlikte). */
  squeeze?: number;
  /** Önizlemede yuva çevresindeki en az duvar kalınlığı, mm (0: kontrol yok). */
  minWall?: number;
  /** Socket uzama yönü (dışa doğru). Verilmezse bölge normallerinin ortalaması. */
  direction?: Vec3;
  pin: PinOptions;
  /** Keys: yüzeyde tıklanan pimler. Boşsa her adanın kapak merkezine bir pim. */
  pins?: PinPlacement[];
}

export interface CutResult {
  body: LabeledMesh;
  parts: LabeledMesh[];
  warnings: string[];
}

export interface CutPreview {
  /** Tapa hacimleri veya kesim kapakları. */
  volumes: MeshData[];
  pins: MeshData[];
  /** Duvarın `minWall`'dan ince kaldığı yerler (yuva büyütülünce modelin dışına taşan kısım). */
  thin: MeshData[];
  warnings: string[];
}

export class CutError extends Error {}

interface Island {
  tris: number[];
  loops: number[][];
  /** Alan ağırlıklı ortalama dış normal. */
  normal: Vec3;
  /** En büyük sınır halkasının düzlemi (Newell normali) ve merkezi. */
  capNormal: Vec3;
  capCenter: Vec3;
  mainLoop: number[];
  /** Tüm mesh'in komşuluk tablosu (adalar arasında ortak). */
  adj: Int32Array;
}

function findIslands(mesh: LabeledMesh, slot: number, warnings: string[] = []): Island[] {
  const triCount = mesh.labels.length;
  const mask = new Uint8Array(triCount);
  let selected = 0;
  for (let t = 0; t < triCount; t++) {
    if (mesh.labels[t] === slot) {
      mask[t] = 1;
      selected++;
    }
  }
  if (selected === 0) throw new CutError('Bu slotta boyalı üçgen yok.');
  if (selected === triCount) throw new CutError('Bölge parçanın tamamını kaplıyor; kesilecek sınır yok.');

  const adj = buildAdjacency(mesh);
  const { normals, areas } = faceNormalsAndAreas(mesh);
  const { component, count } = connectedComponents(triCount, adj, mask);
  const groups: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triCount; t++) if (component[t] >= 0) groups[component[t]].push(t);

  // köşeden bağlı tek tük üçgenler (tırtıklı boyamadan) ayrı parça olmasın
  const groupArea = groups.map((g) => g.reduce((sum, t) => sum + areas[t], 0));
  const largest = Math.max(...groupArea);
  let dropped = 0;

  const absorbedAll = new Uint8Array(triCount);
  let absorbedHoles = 0;
  const islands: Island[] = [];
  for (const [gi, group] of groups.entries()) {
    if (absorbedAll[group[0]]) continue; // başka adanın deliğinin içinde kalmış
    if (groupArea[gi] < 1 && groupArea[gi] < largest * 0.01) {
      dropped++;
      continue;
    }
    const { tris, holes } = closeHoles(adj, areas, group);
    absorbedHoles += holes;
    const islandMask = new Uint8Array(triCount);
    let n: Vec3 = [0, 0, 0];
    for (const t of tris) {
      islandMask[t] = 1;
      absorbedAll[t] = 1;
      n = add(n, scale([normals[3 * t], normals[3 * t + 1], normals[3 * t + 2]], areas[t]));
    }
    const loops = boundaryLoops(mesh, adj, islandMask);
    // pimler en büyük halkanın düzlemine konur
    let main = { normal: normalize(n), center: [0, 0, 0] as Vec3, area: -1 };
    let mainLoop: number[] = loops[0] ?? [];
    for (const loop of loops) {
      const plane = loopPlane(mesh.positions, loop);
      if (plane.area > main.area) {
        main = plane;
        mainLoop = loop;
      }
    }
    const { normal: capNormal, center: capCenter } = main;
    islands.push({ tris, loops, normal: normalize(n), capNormal, capCenter, mainLoop, adj });
  }
  if (dropped) warnings.push(`${dropped} çok küçük boyalı kırıntı atlandı (1 mm² altı).`);
  if (absorbedHoles) warnings.push(`Bölgenin içinde kalan ${absorbedHoles} boyanmamış delik kesime dahil edildi.`);
  return islands;
}

/**
 * Halkanın Newell normali, alan merkezi ve izdüşüm alanı. Merkez köşe
 * ortalaması değil çokgenin alan merkezi: sınırın sık örneklendiği tarafa kaymaz.
 */
function loopPlane(positions: Float32Array, loop: number[]): { normal: Vec3; center: Vec3; area: number } {
  let n: Vec3 = [0, 0, 0];
  let mean: Vec3 = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    const p = vertexAt(positions, loop[i]);
    const q = vertexAt(positions, loop[(i + 1) % loop.length]);
    n = add(n, cross(p, q));
    mean = add(mean, p);
  }
  mean = scale(mean, 1 / loop.length);
  const normal = normalize(n);
  const [u, v] = orthoBasis(normal);
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = sub(vertexAt(positions, loop[i]), mean);
    const q = sub(vertexAt(positions, loop[(i + 1) % loop.length]), mean);
    const px = dot(p, u);
    const py = dot(p, v);
    const qx = dot(q, u);
    const qy = dot(q, v);
    const c = px * qy - qx * py;
    a2 += c;
    cx += (px + qx) * c;
    cy += (py + qy) * c;
  }
  const center = Math.abs(a2) > 1e-12 ? add(mean, add(scale(u, cx / (3 * a2)), scale(v, cy / (3 * a2)))) : mean;
  return { normal, center, area: Math.hypot(...n) / 2 };
}

/**
 * Halkayı kendi düzlemine izdüşürüp üçgenler. Üçgenler kesilen parçanın
 * içinden dışarı (gövdeye doğru) bakacak şekilde döner.
 *
 * İzdüşümde üst üste düşen köşeler (ör. dikey sınır parçaları) önce atılır,
 * düzlemde üçgenlenir, sonra atılan köşeler ait oldukları kenarın üçgenine
 * yelpaze olarak geri eklenir. Böylece halkadaki her köşe kapakta kalır.
 */
function triangulateLoop(positions: Float32Array, loop: number[], normal?: Vec3): number[] {
  const [u, v] = orthoBasis(normal ?? loopPlane(positions, loop).normal);
  const pts = untangle(
    loop.map((i) => {
      const p = vertexAt(positions, i);
      return [dot(p, u), dot(p, v)] as [number, number];
    }),
  );
  let extent = 0;
  for (const p of pts) extent = Math.max(extent, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1]));
  const tol = Math.max(extent * 1e-5, 1e-9);
  const kept: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const last = kept.length ? pts[kept[kept.length - 1]] : null;
    if (last && Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) <= tol) continue;
    kept.push(i);
  }
  while (kept.length > 1) {
    const a = pts[kept[kept.length - 1]];
    const b = pts[kept[0]];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > tol) break;
    kept.pop();
  }
  if (kept.length < 3) throw new CutError('Sınır halkası kapak düzleminde çökük; kapak üretilemedi.');

  const poly = kept.map((i) => pts[i]);
  // izdüşüm yönüne göre halka saat yönünde de olabilir; üçgenler halkayla aynı yöne çevrilir
  let polyArea = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    polyArea += a[0] * b[1] - b[0] * a[1];
  }
  const sign = polyArea >= 0 ? 1 : -1;
  const tris = kernel().triangulate(sign > 0 ? [poly] : [poly.slice().reverse()]).map(
    (tri) => (sign > 0 ? tri : tri.map((x) => poly.length - 1 - x)) as [number, number, number],
  );
  if (!tris.length) throw new CutError('Sınır halkası üçgenlenemedi.');
  const K = kept.length;
  // kept[k] ile kept[k+1] arasında atılan halka köşeleri
  const dropped = (k: number): number[] => {
    const out: number[] = [];
    const from = kept[k];
    const to = kept[(k + 1) % K];
    for (let i = (from + 1) % loop.length; i !== to; i = (i + 1) % loop.length) out.push(i);
    return out;
  };
  const out: number[] = [];
  for (let [i, j, k] of tris) {
    const area =
      (pts[kept[j]][0] - pts[kept[i]][0]) * (pts[kept[k]][1] - pts[kept[i]][1]) -
      (pts[kept[k]][0] - pts[kept[i]][0]) * (pts[kept[j]][1] - pts[kept[i]][1]);
    if (area * sign < 0) [j, k] = [k, j];
    const corners = [i, j, k];
    // her kenar (c -> sonraki) sınır kenarıysa atılan köşeleri araya ekle
    const edges = corners.map((c, e) => {
      const n = corners[(e + 1) % 3];
      return n === (c + 1) % K ? dropped(c) : [];
    });
    let apex = 0;
    for (let e = 1; e < 3; e++) if (edges[e].length > edges[apex].length) apex = e;
    // en çok köşe eklenen kenarın karşısındaki köşe yelpaze merkezi olur
    const start = (apex + 2) % 3;
    const ring: number[] = [];
    for (let s2 = 0; s2 < 3; s2++) {
      const e = (start + s2) % 3;
      ring.push(kept[corners[e]], ...edges[e]);
    }
    for (let r = 1; r + 1 < ring.length; r++) {
      // gövdeye bakacak şekilde ters sırada
      out.push(loop[ring[0]], loop[ring[r + 1]], loop[ring[r]]);
    }
  }
  return out;
}

/**
 * İzdüşümü kendini kesen halkayı üçgenlenebilir hale getirir. Sadece
 * üçgen bağlantısı bu 2B noktalardan kurulur; 3B köşeler değişmez.
 * Önce Laplace yumuşatması (tırtıklı sınırın mikro zikzaklarını açar),
 * olmazsa yay uzunluğuyla çembere eşleme (dışbükey, her zaman geçerli).
 */
function untangle(pts: [number, number][]): [number, number][] {
  if (!polygonSelfIntersects(pts)) return pts;
  let cur = pts;
  for (let iter = 0; iter < 60; iter++) {
    const n = cur.length;
    cur = cur.map((p, i) => {
      const a = cur[(i + n - 1) % n];
      const b = cur[(i + 1) % n];
      return [0.5 * p[0] + 0.25 * (a[0] + b[0]), 0.5 * p[1] + 0.25 * (a[1] + b[1])] as [number, number];
    });
    if (iter % 5 === 4 && !polygonSelfIntersects(cur)) return cur;
  }
  // çember: halka yönü (işaretli alan) korunur
  let area = 0;
  let total = 0;
  const seg: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-9;
    seg.push(d);
    total += d;
  }
  const dirSign = area >= 0 ? 1 : -1;
  let acc = 0;
  return pts.map((_, i) => {
    const t = (2 * Math.PI * acc) / total;
    acc += seg[i];
    return [Math.cos(t), dirSign * Math.sin(t)] as [number, number];
  });
}

/** Kapalı çokgenin kenarları birbirini kesiyor mu. */
function polygonSelfIntersects(pts: [number, number][]): boolean {
  const n = pts.length;
  const orient = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  // x'e göre sıralı kenar taraması
  const edges = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => Math.min(pts[i][0], pts[(i + 1) % n][0]) - Math.min(pts[j][0], pts[(j + 1) % n][0]),
  );
  for (let ai = 0; ai < n; ai++) {
    const i = edges[ai];
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const maxX = Math.max(a[0], b[0]);
    for (let bi = ai + 1; bi < n; bi++) {
      const j = edges[bi];
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (Math.min(c[0], d[0]) > maxX) break;
      if (Math.abs(i - j) <= 1 || Math.abs(i - j) === n - 1) continue;
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** Fast/Keys: bölgeyi sınır halkası boyunca düz kapakla ayırır. */
/** Kapak izdüşüm yönü: verilmezse her halkanın kendi düzlemi. */
type Projection = ((island: Island) => Vec3) | undefined;

/**
 * `projection`: kapaklar halka düzlemi yerine bu yöne izdüşürülür (bölge
 * normali veya elle verilen yön). Kavisli halkalar kendi düzleminde katlanabiliyor.
 */
function capSplit(
  mesh: LabeledMesh,
  islands: Island[],
  slot: number,
  projection?: Projection,
): { body: LabeledMesh; parts: LabeledMesh[] } {
  const triCount = mesh.labels.length;
  const inIsland = new Uint8Array(triCount);
  const bodyIdx: number[] = [];
  const bodyLabels: number[] = [];
  const parts: LabeledMesh[] = [];

  for (const island of islands) {
    for (const t of island.tris) inIsland[t] = 1;
    const partIdx: number[] = [];
    const partLabels: number[] = [];
    for (const t of island.tris) {
      partIdx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
      partLabels.push(mesh.labels[t]);
    }
    for (const loop of island.loops) {
      const cap = triangulateLoop(mesh.positions, loop, projection?.(island));
      for (let i = 0; i < cap.length; i += 3) {
        partIdx.push(cap[i], cap[i + 1], cap[i + 2]);
        partLabels.push(slot);
        bodyIdx.push(cap[i], cap[i + 2], cap[i + 1]);
        bodyLabels.push(BASE_SLOT);
      }
    }
    parts.push(compact(mesh.positions, partIdx, partLabels));
  }
  for (let t = 0; t < triCount; t++) {
    if (inIsland[t]) continue;
    bodyIdx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
    bodyLabels.push(mesh.labels[t]);
  }
  return { body: compact(mesh.positions, bodyIdx, bodyLabels), parts };
}

function compact(positions: Float32Array, idx: number[], labels: number[]): LabeledMesh {
  const tmp: MeshData = { positions, indices: Uint32Array.from(idx) };
  const all = new Uint32Array(labels.length);
  for (let i = 0; i < all.length; i++) all[i] = i;
  const { mesh } = extractTriangles(tmp, all);
  return { ...mesh, labels: Uint16Array.from(labels) };
}

/**
 * Yüzey yamasını `dir` boyunca +eps'ten -depth'e süpürerek kapalı hacim üretir.
 * `tris` düz köşe indeksi üçlüleri (dışa, `dir` tarafına bakan), `loops` yamanın
 * sınır halkaları (üçgenlerdeki kenar yönüyle). Yama `dir` yönünde yükseklik alanı olmalı.
 */
function extrudePatch(
  positions: Float32Array,
  tris: ArrayLike<number>,
  loops: number[][],
  dir: Vec3,
  depth: number,
  eps: number,
  squeeze = 0,
): MeshData {
  const vmap = new Map<number, number>();
  for (let i = 0; i < tris.length; i++) if (!vmap.has(tris[i])) vmap.set(tris[i], vmap.size);
  const n = vmap.size;
  // squeeze: alt kapak, yamanın ekseni etrafında içe daraltılır (C5)
  let center: Vec3 = [0, 0, 0];
  for (const v of vmap.keys()) center = add(center, vertexAt(positions, v));
  center = scale(center, 1 / Math.max(1, n));
  const k = 1 - Math.min(0.9, Math.max(0, squeeze));
  // üst köşeler 0..n-1, alt köşeler n..2n-1
  const out = new Float32Array(n * 6);
  for (const [v, i] of vmap) {
    const p = vertexAt(positions, v);
    out.set(add(p, scale(dir, eps)), 3 * i);
    const rel = sub(p, center);
    const lateral = sub(rel, scale(dir, dot(rel, dir)));
    const bottom = sub(sub(p, scale(dir, depth)), scale(lateral, 1 - k));
    out.set(bottom, 3 * (i + n));
  }
  const idx: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const a = vmap.get(tris[i]) as number;
    const b = vmap.get(tris[i + 1]) as number;
    const c = vmap.get(tris[i + 2]) as number;
    idx.push(a, b, c);
    idx.push(a + n, c + n, b + n);
  }
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = vmap.get(loop[i]) as number;
      const b = vmap.get(loop[(i + 1) % loop.length]) as number;
      idx.push(b, a, a + n);
      idx.push(b, a + n, b + n);
    }
  }
  return { positions: out, indices: Uint32Array.from(idx) };
}

/** Socket hacmi: ada yüzeyi `dir` boyunca süpürülür. */
function extrudeVolume(mesh: MeshData, island: Island, dir: Vec3, depth: number, eps: number, squeeze = 0): MeshData {
  const tris: number[] = [];
  for (const t of island.tris) tris.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
  return extrudePatch(mesh.positions, tris, island.loops, dir, depth, eps, squeeze);
}

/**
 * Çıkıntı socket'i için tapa gövdesi: her sınır halkasının kapağı, kendi
 * normali boyunca derinlik kadar gövdenin içine uzatılır. Kapak kendi
 * düzleminde üçgenlendiği için her zaman yükseklik alanıdır.
 */
function capPlugVolumes(
  positions: Float32Array,
  island: Island,
  depth: number,
  eps: number,
  projection?: Projection,
  squeeze = 0,
): { mesh: MeshData; dir: Vec3 }[] {
  return island.loops.map((loop) => {
    const dir = projection?.(island) ?? loopPlane(positions, loop).normal;
    // triangulateLoop gövdeye bakan kapak verir; süpürme için dışa (dir) bakanı gerekir
    const cap = flipAll(triangulateLoop(positions, loop, dir));
    return { mesh: extrudePatch(positions, cap, [loop], dir, depth, eps, squeeze), dir };
  });
}

/**
 * Yükseklik alanı olmayan bölgeler için yedek: `dir`'e bakan üçgenler tek
 * parça süpürülür, bakmayanlar için üçgen başına prizma eklenir.
 */
function prismUnion(mesh: MeshData, island: Island, dir: Vec3, depth: number, eps: number, scope: Scope): Manifold {
  const { normals } = faceNormalsAndAreas(mesh);
  const pieces: Manifold[] = [];
  const goodMask = new Uint8Array(mesh.indices.length / 3);
  const good: number[] = [];
  const bad: number[] = [];
  for (const t of island.tris) {
    const nd = normals[3 * t] * dir[0] + normals[3 * t + 1] * dir[1] + normals[3 * t + 2] * dir[2];
    if (nd >= 0.02) {
      goodMask[t] = 1;
      good.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
    } else {
      bad.push(t);
    }
  }
  let sweptAll = false;
  if (good.length) {
    try {
      const loops = boundaryLoops(mesh, island.adj, goodMask);
      pieces.push(scope.keep(toManifold(extrudePatch(mesh.positions, good, loops, dir, depth, eps), CUT_FACE_ID)));
      sweptAll = true;
    } catch (e) {
      if (!(e instanceof KernelError)) throw e;
    }
  }
  // süpürme başarısızsa tüm üçgenler prizma olur
  const prismTris = sweptAll ? bad : island.tris;
  for (const t of prismTris) {
    const nd = normals[3 * t] * dir[0] + normals[3 * t + 1] * dir[1] + normals[3 * t + 2] * dir[2];
    if (Math.abs(nd) < 1e-3) continue;
    const vs = [0, 1, 2].map((k) => vertexAt(mesh.positions, mesh.indices[3 * t + k]));
    const positions = new Float32Array(18);
    vs.forEach((p, k) => {
      positions.set(add(p, scale(dir, eps)), 3 * k);
      positions.set(sub(p, scale(dir, depth)), 3 * (k + 3));
    });
    let idx = [0, 1, 2, 3, 5, 4, 1, 0, 3, 1, 3, 4, 2, 1, 4, 2, 4, 5, 0, 2, 5, 0, 5, 3];
    if (nd < 0) idx = flipAll(idx);
    pieces.push(scope.keep(toManifold({ positions, indices: Uint32Array.from(idx) }, CUT_FACE_ID)));
  }
  if (!pieces.length) throw new CutError('Bölge seçilen yöne paralel; hacim üretilemedi.');
  return pieces.length === 1 ? pieces[0] : scope.keep(kernel().Manifold.union(pieces));
}

function flipAll(idx: number[]): number[] {
  const out = idx.slice();
  for (let i = 0; i < out.length; i += 3) [out[i + 1], out[i + 2]] = [out[i + 2], out[i + 1]];
  return out;
}

/** `vol` hacmini `c` kadar büyütür: yana 8 yönde ve `-dir` yönünde kopyaların birleşimi. */
function growVolume(vol: Manifold, dir: Vec3, c: number, scope: Scope): Manifold {
  if (c <= 0) return vol;
  const [u, v] = orthoBasis(dir);
  const copies: Manifold[] = [vol];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const off = add(scale(u, c * Math.cos(a)), scale(v, c * Math.sin(a)));
    copies.push(scope.keep(vol.translate(off)));
  }
  copies.push(scope.keep(vol.translate(scale(dir, -c))));
  return scope.keep(kernel().Manifold.union(copies));
}

function withFaceId(man: Manifold, id: number, scope: Scope): Manifold {
  const mesh = man.getMesh();
  mesh.faceID = new Uint32Array(mesh.numTri).fill(id);
  return scope.keep(new (kernel().Manifold)(mesh));
}

/** `axis` boyunca uzanan, `center`'da ortalanmış pim. */
function makePin(pin: PinOptions, center: Vec3, axis: Vec3, grow: number, scope: Scope): Manifold {
  const { Manifold } = kernel();
  const r = pin.radius + grow;
  const h = pin.length + 2 * grow;
  let shape: Manifold;
  if (pin.shape === 'cube') shape = Manifold.cube([2 * r, 2 * r, h], true);
  else shape = Manifold.cylinder(h, r, r, pin.shape === 'octagon' ? 8 : 32, true);
  scope.keep(shape);
  const [u, v] = orthoBasis(axis);
  // sütun öncelikli 4x4: x->u, y->v, z->axis, öteleme->center
  const m = [...u, 0, ...v, 0, ...axis, 0, ...center, 1] as unknown as Parameters<Manifold['transform']>[0];
  return withFaceId(scope.keep(shape.transform(m)), CUT_FACE_ID, scope);
}

function pinCenters(
  positions: Float32Array,
  islands: Island[],
  pins: PinPlacement[] | undefined,
  base: PinOptions,
): { island: Island; center: Vec3; axis: Vec3; spec: PinOptions }[] {
  const raw: { island: Island; pin: PinPlacement }[] =
    !pins || pins.length === 0
      ? islands.map((island) => ({ island, pin: { point: island.capCenter } }))
      : pins.map((pin) => {
          let best = islands[0];
          let bestDist = Infinity;
          for (const island of islands) {
            const d = Math.hypot(...sub(pin.point, island.capCenter));
            if (d < bestDist) {
              best = island;
              bestDist = d;
            }
          }
          return { island: best, pin };
        });
  // nokta, kapak normali boyunca kapak yüzeyine taşınır (kapak düz olmayabilir)
  return raw.map(({ island, pin }) => {
    const cap = triangulateLoop(positions, island.mainLoop);
    const n = island.capNormal;
    const onPlane = sub(pin.point, scale(n, dot(sub(pin.point, island.capCenter), n)));
    const center = lineCapIntersection(positions, cap, onPlane, n) ?? onPlane;
    // eksen gövdeye doğru bakmalı (kapak normalinin tersi yönde)
    let axis = pin.axis ? normalize(pin.axis) : scale(n, -1);
    if (dot(axis, n) > 0) axis = scale(axis, -1);
    const spec = { ...base, radius: pin.radius ?? base.radius, length: pin.length ?? base.length };
    return { island, center, axis, spec };
  });
}

/** `origin + s*dir` doğrusunun kapak üçgenleriyle kesiştiği nokta. */
function lineCapIntersection(positions: Float32Array, cap: number[], origin: Vec3, dir: Vec3): Vec3 | null {
  let best: Vec3 | null = null;
  let bestS = Infinity;
  for (let i = 0; i < cap.length; i += 3) {
    const a = vertexAt(positions, cap[i]);
    const e1 = sub(vertexAt(positions, cap[i + 1]), a);
    const e2 = sub(vertexAt(positions, cap[i + 2]), a);
    const h = cross(dir, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const sv = sub(origin, a);
    const u = f * dot(sv, h);
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const q = cross(sv, e1);
    const v = f * dot(dir, q);
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const s = f * dot(e2, q);
    if (Math.abs(s) < bestS) {
      bestS = Math.abs(s);
      best = add(origin, scale(dir, s));
    }
  }
  return best;
}

function socketDirection(island: Island, opts: CutOptions): Vec3 {
  return opts.direction ? normalize(opts.direction) : island.normal;
}

function isHeightField(mesh: MeshData, island: Island, dir: Vec3): boolean {
  const { normals, areas } = faceNormalsAndAreas(mesh);
  for (const t of island.tris) {
    if (areas[t] < 1e-9) continue;
    const nd = normals[3 * t] * dir[0] + normals[3 * t + 1] * dir[1] + normals[3 * t + 2] * dir[2];
    if (nd < 0.02) return false;
  }
  return true;
}

function socketVolume(mesh: MeshData, island: Island, opts: CutOptions, eps: number, scope: Scope, warnings: string[]): Manifold {
  const dir = socketDirection(island, opts);
  if (isHeightField(mesh, island, dir)) {
    return scope.keep(toManifold(extrudeVolume(mesh, island, dir, opts.depth, eps, opts.squeeze), CUT_FACE_ID));
  }
  warnings.push('Bölge seçilen yönden tam görünmüyor; yedek yöntem (süpürme + prizma) kullanıldı.');
  return prismUnion(mesh, island, dir, opts.depth, eps, scope);
}

function manifoldMesh(man: Manifold): MeshData {
  const m = man.getMesh();
  const positions = new Float32Array(m.numVert * 3);
  for (let i = 0; i < m.numVert; i++) {
    positions[3 * i] = m.vertProperties[m.numProp * i];
    positions[3 * i + 1] = m.vertProperties[m.numProp * i + 1];
    positions[3 * i + 2] = m.vertProperties[m.numProp * i + 2];
  }
  return { positions, indices: new Uint32Array(m.triVerts) };
}

/** Kesim yapmadan tapa hacimlerini, kapakları ve pimleri döndürür (C1 önizleme). */
export function previewCut(mesh: LabeledMesh, opts: CutOptions): CutPreview {
  const scope = new Scope();
  const warnings: string[] = [];
  try {
    const islands = findIslands(mesh, opts.slot, warnings);
    const volumes: MeshData[] = [];
    const pins: MeshData[] = [];
    // duvar kontrolü için: [yuvayı içeren katı, yuva hacmi (büyütülmüş), içeri bakan yön, yüzeydeki referans nokta, ad]
    const cavities: { container: () => Manifold; grown: () => Manifold; inward: Vec3; ref: Vec3; slack: number; name: string }[] = [];
    // kesim halkası düzlemden ne kadar sapıyor: yuvanın ağzı bu kadar derinliğe kadar yüzeye açılabilir
    const slackOf = (island: Island, normal: Vec3) => {
      let m = 0;
      for (const v of island.mainLoop) m = Math.max(m, Math.abs(dot(sub(vertexAt(mesh.positions, v), island.capCenter), normal)));
      return m;
    };
    const minWall = opts.minWall ?? 0;
    let model: Manifold | null = null;
    const modelM = () => (model ??= scope.keep(toManifold(mesh, mesh.labels)));

    if (opts.mode === 'socket' && !useSweepSocket(mesh, islands, opts)) {
      // çıkıntı yöntemi: kesim kapakları ve gövdeye giren tapa prizmaları
      const eps = Math.max(1, 4 * opts.clearance);
      for (const island of islands) {
        for (const { mesh: vol, dir } of capPlugVolumes(mesh.positions, island, opts.depth, eps, capProjections(opts)[0], opts.squeeze)) {
          volumes.push(vol);
          cavities.push({
            container: modelM,
            grown: () => growVolume(scope.keep(toManifold(vol, CUT_FACE_ID)), dir, opts.clearance + minWall, scope),
            inward: scale(dir, -1),
            ref: island.capCenter,
            slack: slackOf(island, dir),
            name: 'Tapa yuvası',
          });
        }
      }
    } else if (opts.mode === 'socket') {
      const eps = Math.max(0.5, 4 * opts.clearance);
      for (const island of islands) {
        const dir = socketDirection(island, opts);
        const vol = isHeightField(mesh, island, dir)
          ? extrudeVolume(mesh, island, dir, opts.depth, eps, opts.squeeze)
          : manifoldMesh(socketVolume(mesh, island, opts, eps, scope, warnings));
        volumes.push(vol);
        cavities.push({
          container: modelM,
          grown: () => growVolume(scope.keep(toManifold(vol, CUT_FACE_ID)), dir, opts.clearance + minWall, scope),
          inward: scale(dir, -1),
          ref: island.capCenter,
          slack: slackOf(island, dir),
          name: 'Tapa yuvası',
        });
      }
    } else {
      for (const island of islands) {
        const idx: number[] = [];
        for (const loop of island.loops) idx.push(...triangulateLoop(mesh.positions, loop));
        volumes.push(extractTriangles({ positions: mesh.positions, indices: Uint32Array.from(idx) }, range(idx.length / 3)).mesh);
      }
      if (opts.mode === 'keys') {
        const placed = pinCenters(mesh.positions, islands, opts.pins, opts.pin);
        let split: { body: Manifold; parts: Manifold[] } | null = null;
        const splitM = () => {
          if (!split) {
            const sp = capSplit(mesh, islands, opts.slot);
            split = {
              body: scope.keep(toManifold(sp.body, sp.body.labels)),
              parts: sp.parts.map((p) => scope.keep(toManifold(p, p.labels))),
            };
          }
          return split;
        };
        for (const [k, { island, center, axis, spec }] of placed.entries()) {
          pins.push(manifoldMesh(makePin(spec, center, axis, 0, scope)));
          // yuva, pimin karşı tarafındaki katıda açılır
          const inward = opts.pin.onPart ? axis : scale(axis, -1);
          cavities.push({
            container: () => (opts.pin.onPart ? splitM().body : splitM().parts[islands.indexOf(island)]),
            grown: () => makePin(spec, center, axis, opts.clearance + minWall, scope),
            inward,
            ref: center,
            slack: slackOf(island, island.capNormal),
            name: placed.length > 1 ? `Pim ${k + 1}` : 'Pim',
          });
        }
      }
    }

    const thin: MeshData[] = [];
    if (minWall > 0) {
      for (const c of cavities) {
        try {
          // yuvanın ağzı (yüzeye açılan kısmı) bilerek dışarıda: kesim yüzeyinin minWall
          // (+ kesim halkasının düzlemden sapması) altından kes
          const grown = c.grown().trimByPlane(c.inward, dot(c.inward, c.ref) + minWall + c.slack);
          scope.keep(grown);
          const out = scope.keep(grown.subtract(c.container()));
          if (out.volume() > 1e-3) {
            thin.push(manifoldMesh(out));
            warnings.push(`${c.name} çevresinde duvar ${minWall} mm'den ince (kırmızı). Derinliği/pimi küçültün veya yerini değiştirin.`);
          }
        } catch (e) {
          if (!(e instanceof KernelError)) throw e;
        }
      }
    }
    return { volumes, pins, thin, warnings };
  } finally {
    scope.dispose();
  }
}

function range(n: number): Uint32Array {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/** Seçili slotun bölgelerini parçadan ayırır. */
export function cutRegion(mesh: LabeledMesh, opts: CutOptions): CutResult {
  const scope = new Scope();
  const warnings: string[] = [];
  try {
    const islands = findIslands(mesh, opts.slot, warnings);
    if (opts.mode === 'socket') return socketCut(mesh, islands, opts, scope, warnings);

    const split = capSplit(mesh, islands, opts.slot);
    let body: Manifold;
    let parts: Manifold[];
    try {
      body = scope.keep(toManifold(split.body, split.body.labels));
      parts = split.parts.map((p) => scope.keep(toManifold(p, p.labels)));
    } catch (e) {
      if (e instanceof KernelError) {
        throw new CutError(
          'Kapak üretilemedi: bölge sınırı düzgün tek bir halka değil (delikli veya kendine değen bölge). Sınırı düzeltin ya da Socket kullanın.',
        );
      }
      throw e;
    }

    if (opts.mode === 'keys') {
      const placed = pinCenters(mesh.positions, islands, opts.pins, opts.pin);
      for (const [k, { island, center, axis, spec }] of placed.entries()) {
        const i = islands.indexOf(island);
        const pin = makePin(spec, center, axis, 0, scope);
        const hole = makePin(spec, center, axis, opts.clearance, scope);
        checkPinContainment(pin, parts[i], body, spec, warnings, placed.length > 1 ? `Pim ${k + 1}` : 'Pim');
        if (opts.pin.onPart) {
          parts[i] = scope.keep(parts[i].add(pin));
          body = scope.keep(body.subtract(hole));
        } else {
          body = scope.keep(body.add(pin));
          parts[i] = scope.keep(parts[i].subtract(hole));
        }
      }
    }
    return {
      body: fromManifold(body, BASE_SLOT),
      parts: parts.map((p) => partFrom(p, opts.slot)),
      warnings,
    };
  } finally {
    scope.dispose();
  }
}

function checkPinContainment(
  pin: Manifold,
  part: Manifold,
  body: Manifold,
  opts: PinOptions,
  warnings: string[],
  name = 'Pim',
): void {
  const half = pin.volume() / 2;
  const scope = new Scope();
  try {
    const inPart = scope.keep(pin.intersect(part)).volume();
    const inBody = scope.keep(pin.intersect(body)).volume();
    // pim modelin dışına taşıyorsa duvar incedir; bir tarafta çok az kalıyorsa tutmaz
    if (inPart + inBody < 0.98 * 2 * half) {
      warnings.push(
        `${name} modelin dışına taşıyor (%${Math.round((50 * (inPart + inBody)) / half)} içeride). Duvar ince olabilir; pimi küçültün veya yerini değiştirin.`,
      );
    } else if (inPart < 0.5 * half || inBody < 0.5 * half) {
      warnings.push(
        `${name} kesim yüzeyine ortalanmamış (parçada %${Math.round((50 * inPart) / half)}, gövdede %${Math.round((50 * inBody) / half)}).`,
      );
    }
    if (opts.radius <= 0 || opts.length <= 0) warnings.push('Pim boyutu geçersiz.');
  } finally {
    scope.dispose();
  }
}

/**
 * Süpürme kullanılabilir mi: her ada kendi yönünde yükseklik alanıysa
 * (düz/sığ yamalar). Değilse çıkıntı yöntemi denenir.
 */
function useSweepSocket(mesh: MeshData, islands: Island[], opts: CutOptions): boolean {
  return islands.every((i) => isHeightField(mesh, i, socketDirection(i, opts)));
}

function socketCut(mesh: LabeledMesh, islands: Island[], opts: CutOptions, scope: Scope, warnings: string[]): CutResult {
  if (!useSweepSocket(mesh, islands, opts)) {
    try {
      return capSocketCut(mesh, islands, opts, scope, warnings);
    } catch (e) {
      if (!(e instanceof CutError || e instanceof KernelError)) throw e;
    }
    const r = sweepSocketCut(mesh, islands, opts, scope, []);
    const note = 'Bölge alttan oyuk (tek yönden tam görünmüyor); yedek yöntemle kesildi. Tapanın oturmasını önizlemede kontrol edin.';
    return { ...r, warnings: [...warnings, note, ...r.warnings.filter((w) => !w.startsWith('Bölge seçilen yönden'))] };
  }
  return sweepSocketCut(mesh, islands, opts, scope, warnings);
}

/** Çıkıntı socket'i: kapakla ayır, kapak prizmasını tapaya ekle, büyütülmüş halini gövdeden çıkar. */
/** Denenecek kapak izdüşümleri: elle verilen yön, yoksa halka düzlemi ve sonra bölge normali. */
function capProjections(opts: CutOptions): Projection[] {
  if (opts.direction) {
    const d = normalize(opts.direction);
    return [() => d];
  }
  return [undefined, (island) => island.normal];
}

function capSocketCut(mesh: LabeledMesh, islands: Island[], opts: CutOptions, scope: Scope, warnings: string[]): CutResult {
  let lastError: unknown;
  for (const projection of capProjections(opts)) {
    try {
      const r = capSocketCutWith(mesh, islands, opts, scope, projection);
      return { ...r, warnings: [...warnings, ...r.warnings] };
    } catch (e) {
      if (!(e instanceof CutError || e instanceof KernelError)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

function capSocketCutWith(mesh: LabeledMesh, islands: Island[], opts: CutOptions, scope: Scope, projection: Projection): CutResult {
  const warnings: string[] = [];
  const split = capSplit(mesh, islands, opts.slot, projection);
  const bodyBase = scope.keep(toManifold(split.body, split.body.labels));
  // gövdeye giren kısım orijinal modelden alınır: kapağın üstüne de biraz taşar,
  // çıkıntıyla çakışan yüzey yerine hacim olarak üst üste biner
  const model = scope.keep(toManifold(mesh, mesh.labels));
  const eps = Math.max(1, 4 * opts.clearance);
  const parts: LabeledMesh[] = [];
  const holes: Manifold[] = [];
  islands.forEach((island, i) => {
    let part = scope.keep(toManifold(split.parts[i], split.parts[i].labels));
    for (const { mesh: volMesh, dir } of capPlugVolumes(mesh.positions, island, opts.depth, eps, projection, opts.squeeze)) {
      const vol = scope.keep(toManifold(volMesh, CUT_FACE_ID));
      part = scope.keep(part.add(scope.keep(vol.intersect(model))));
      holes.push(growVolume(vol, dir, opts.clearance, scope));
    }
    if (part.volume() <= 0) throw new CutError('Tapa hacmi boş çıktı.');
    parts.push(partFrom(part, opts.slot));
  });
  const allHoles = holes.length === 1 ? holes[0] : scope.keep(kernel().Manifold.union(holes));
  const body = scope.keep(bodyBase.subtract(allHoles));
  return { body: fromManifold(body, BASE_SLOT), parts, warnings };
}

function sweepSocketCut(mesh: LabeledMesh, islands: Island[], opts: CutOptions, scope: Scope, warnings: string[]): CutResult {
  const model = scope.keep(toManifold(mesh, mesh.labels));
  const eps = Math.max(0.5, 4 * opts.clearance);
  const parts: LabeledMesh[] = [];
  const holes: Manifold[] = [];
  for (const island of islands) {
    const vol = socketVolume(mesh, island, opts, eps, scope, warnings);
    const part = scope.keep(model.intersect(vol));
    if (part.isEmpty()) {
      warnings.push('Bir bölge için tapa boş çıktı; atlandı.');
      continue;
    }
    parts.push(partFrom(part, opts.slot));
    holes.push(growVolume(vol, socketDirection(island, opts), opts.clearance, scope));
  }
  if (!parts.length) throw new CutError('Hiç tapa üretilemedi.');
  const allHoles = holes.length === 1 ? holes[0] : scope.keep(kernel().Manifold.union(holes));
  const body = scope.keep(model.subtract(allHoles));
  return { body: fromManifold(body, BASE_SLOT), parts, warnings };
}

/** Kesilen parçadaki taban etiketli yüzler parçanın slotunu alır; başka slotlar korunur. */
function partFrom(man: Manifold, slot: number): LabeledMesh {
  const m = fromManifold(man, slot);
  for (let t = 0; t < m.labels.length; t++) if (m.labels[t] === BASE_SLOT) m.labels[t] = slot;
  return m;
}

/** D3: kopuk parçaları ayrı mesh'lere böler. */
export function splitComponents(mesh: LabeledMesh): LabeledMesh[] {
  const adj = buildAdjacency(mesh);
  const triCount = mesh.labels.length;
  const { component, count } = connectedComponents(triCount, adj);
  if (count <= 1) return [mesh];
  const groups: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triCount; t++) groups[component[t]].push(t);
  return groups.map((tris) => {
    const { mesh: sub } = extractTriangles(mesh, tris);
    return { ...sub, labels: Uint16Array.from(tris, (t) => mesh.labels[t]) };
  });
}
