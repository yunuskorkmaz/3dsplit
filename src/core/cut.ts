import type { Manifold } from 'manifold-3d';
import { signedVolume } from './geometry';
import {
  CUT_FACE_ID,
  fromManifoldMapped,
  KernelError,
  kernel,
  modelManifold,
  Scope,
  toManifold,
} from './kernel';
import { regionInsideLoop } from './lasso';
import { meshTopology } from './meshTopology';
import { closeHoles } from './paint';
import { boundaryLoops, connectedComponents, extractTriangles } from './topology';
import { BASE_SLOT, type LabeledMesh, type MeshData, type Vec3 } from './types';
import { add, cross, dot, normalize, orthoBasis, scale, sub, vertexAt } from './vec';

export type CutMode = 'fast' | 'socket' | 'keys';
export type PinShape = 'cylinder' | 'cube' | 'octagon' | 'snap';

export interface PinOptions {
  shape: PinShape;
  /** Pim yarıçapı (küpte yarı genişlik), mm. */
  radius: number;
  /** Pimin toplam boyu, mm. Yarısı parçada, yarısı karşı tarafta kalır. */
  length: number;
  /** true: pim kesilen parçada, yuva gövdede. */
  onPart: boolean;
  /**
   * X31: eksenel boşluk, mm: delik pimden her uçta bu kadar uzun olur, pim
   * dibe oturmaz (kesim yüzeyleri birbirine değer). Verilmezse `clearance`.
   */
  depthClearance?: number;
  /**
   * X32: pim uçlarında pah, mm (konik uç). Yuvaya kolay girer, baskıda uç
   * sarkmaz. Delik pahlanmaz. Snap pimde kullanılmaz.
   */
  chamfer?: number;
  /**
   * X33: yarıçap ve boy kesitten hesaplanır (kendi boyutu verilmiş pimler
   * hariç): yarıçap, pim merkezinden kesim halkasına en kısa uzaklığın ve
   * adadaki pim başına düşen alanın payı; boy yarıçapın 4 katı.
   */
  auto?: boolean;
  /**
   * Pim boyunun gövde (kesim yüzeyinin eksen yönündeki) tarafında kalan payı,
   * 0..1; verilmezse 0.5 (yarı yarıya). Pim parçadaysa bu, gövdedeki yuvanın
   * derinliğini belirler.
   */
  bodyRatio?: number;
}

/** Tek bir pimin yeri ve (isteğe bağlı) kendine özgü boyutu/ekseni. */
export interface PinPlacement {
  /** Yüzeyde tıklanan nokta; kapak yüzeyine izdüşürülür. */
  point: Vec3;
  radius?: number;
  length?: number;
  /** Pimin ekseni (herhangi bir yönde verilebilir; gövdeye bakacak şekilde çevrilir). */
  axis?: Vec3;
  /** Bu pime özgü gövde payı (`PinOptions.bodyRatio`). */
  bodyRatio?: number;
}

export interface CutOptions {
  mode: CutMode;
  slot: number;
  /** Socket: tapanın yüzeyden içeri uzandığı derinlik, mm. */
  depth: number;
  /** C12 (Link all kapalı): ada anahtarı -> kendi derinliği. Verilmeyen ada `depth` kullanır. */
  depthByIsland?: Record<number, number>;
  /** Tapa/yuva ve pim/yuva arasındaki boşluk, mm. */
  clearance: number;
  /** Socket: tapa tabanının içe daralma oranı (0 düz, 0.5 taban yarı genişlikte). */
  squeeze?: number;
  /**
   * C7: tapa ayağının kenardan içeri çekilmesi, mm (0: tam yüzey). Çıkıntıda
   * görünen kısım aynı kalır, gövdeye giren ayak daralır; yuvanın çevresinde
   * gövdede taşıyıcı basamak kalır. Düz yamada görünen tapa da daralır.
   */
  inset?: number;
  /**
   * C6: tapa alt halkasının 8 yöndeki radyal düzeltmesi, mm (+ dışa). Yönler tapa
   * ekseninin etrafında `orthoBasis(yön)` tabanına göre 0°, 45°, … 315°; aradaki
   * açılar yumuşak (kosinüs) aradeğerlenir.
   */
  ringProfile?: number[];
  /** Önizlemede yuva çevresindeki en az duvar kalınlığı, mm (0: kontrol yok). */
  minWall?: number;
  /** Socket uzama yönü (dışa doğru). Verilmezse bölge normallerinin ortalaması. */
  direction?: Vec3;
  pin: PinOptions;
  /** Keys: yüzeyde tıklanan pimler. Boşsa her adanın kapak merkezine bir pim. */
  pins?: PinPlacement[];
  /**
   * X4 (Fast/Keys): true ise sınır halkası yerine halkaya en uygun düzlemle
   * kesilir (dümdüz kesim yüzeyi). Kapak üretilemezse otomatik de kullanılır.
   */
  planar?: boolean;
  /**
   * X53: kesimden önce slot sınırını üçgenlerin içinden geçir. Boyama kaydına
   * yazılmaz; manifold önbelleği bu kopyaya ayrı anahtarla bağlanır.
   */
  smoothEdge?: boolean;
  /**
   * X56: dikiş halkasının köşe sırası. Varsa boyalı slot kesilmez; model bu
   * halkanın düzleminden iki kapalı parçaya ayrılır.
   */
  seamLoop?: number[];
  /**
   * X64: düz kesilen yüzler arasında bırakılan boşluk, mm. 0 ise yüzler
   * birbirine değer. Pim toleransından ayrıdır. Eğri (çizgiyi izleyen) kesitte uygulanmaz.
   */
  faceGap?: number;
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
  /** C6: tapa alt halkasındaki 8 kontrol yönünün noktaları (ilki 0°). */
  ringMarkers: Vec3[];
  warnings: string[];
}

/** Kesim hatası. `loops`: sorunlu bölgenin sınır halkaları (arayüzde kırmızı gösterilir). */
export class CutError extends Error {
  loops?: Vec3[][];
  constructor(message: string, loops?: Vec3[][]) {
    super(message);
    this.loops = loops;
  }
}

/**
 * Modelin manifold'u (yüz kimliği = üçgen numarası). Worker aynı geometri
 * için önbellekten verir; verilmezse her çağrıda kurulur. Etiketlerden
 * bağımsızdır, boyama değişse de geçerli kalır.
 */
export type ModelProvider = () => Manifold;
let modelProvider: ModelProvider | null = null;

function modelOf(mesh: LabeledMesh, scope: Scope): Manifold {
  // sağlayıcının verdiği manifold önbellektedir: scope'a eklenmez (silinmesin)
  return modelProvider ? modelProvider() : scope.keep(modelManifold(mesh));
}

function withModel<T>(provider: ModelProvider | undefined, fn: () => T): T {
  modelProvider = provider ?? null;
  try {
    return fn();
  } finally {
    modelProvider = null;
  }
}

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
  /** Kararlı kimlik: adanın (delik katılmadan önceki) en küçük üçgen numarası. Arayüz aynı yolla hesaplar. */
  key: number;
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
  if (selected === triCount)
    throw new CutError('Bölge parçanın tamamını kaplıyor; kesilecek sınır yok.');

  const { adj, normals, areas } = meshTopology(mesh);
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
    islands.push({
      tris,
      loops,
      normal: normalize(n),
      capNormal,
      capCenter,
      mainLoop,
      adj,
      key: group[0],
    });
  }
  if (dropped) warnings.push(`${dropped} çok küçük boyalı kırıntı atlandı (1 mm² altı).`);
  if (absorbedHoles)
    warnings.push(`Bölgenin içinde kalan ${absorbedHoles} boyanmamış delik kesime dahil edildi.`);
  return islands;
}

/**
 * Halkanın Newell normali, alan merkezi ve izdüşüm alanı. Merkez köşe
 * ortalaması değil çokgenin alan merkezi: sınırın sık örneklendiği tarafa kaymaz.
 */
function loopPlane(
  positions: Float32Array,
  loop: number[],
): { normal: Vec3; center: Vec3; area: number } {
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
  const center =
    Math.abs(a2) > 1e-12 ? add(mean, add(scale(u, cx / (3 * a2)), scale(v, cy / (3 * a2)))) : mean;
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
  for (const p of pts)
    extent = Math.max(extent, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1]));
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
  if (kept.length < 3)
    throw new CutError('Sınır halkası kapak düzleminde çökük; kapak üretilemedi.');

  const poly = kept.map((i) => pts[i]);
  // izdüşüm yönüne göre halka saat yönünde de olabilir; üçgenler halkayla aynı yöne çevrilir
  let polyArea = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    polyArea += a[0] * b[1] - b[0] * a[1];
  }
  const sign = polyArea >= 0 ? 1 : -1;
  const tris = kernel()
    .triangulate(sign > 0 ? [poly] : [poly.slice().reverse()])
    .map(
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
      return [0.5 * p[0] + 0.25 * (a[0] + b[0]), 0.5 * p[1] + 0.25 * (a[1] + b[1])] as [
        number,
        number,
      ];
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
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0)
        return true;
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
/** Kapakla ayrılmış parça: `origin` her üçgenin orijinal üçgen numarası, kapakta CUT_FACE_ID. */
interface SplitMesh extends MeshData {
  origin: Uint32Array;
}

function capSplit(
  mesh: LabeledMesh,
  islands: Island[],
  projection?: Projection,
): { body: SplitMesh; parts: SplitMesh[] } {
  const triCount = mesh.labels.length;
  const inIsland = new Uint8Array(triCount);
  const bodyIdx: number[] = [];
  const bodyOrigin: number[] = [];
  const parts: SplitMesh[] = [];

  for (const island of islands) {
    for (const t of island.tris) inIsland[t] = 1;
    const partIdx: number[] = [];
    const partOrigin: number[] = [];
    for (const t of island.tris) {
      partIdx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
      partOrigin.push(t);
    }
    for (const loop of island.loops) {
      const cap = triangulateLoop(mesh.positions, loop, projection?.(island));
      for (let i = 0; i < cap.length; i += 3) {
        partIdx.push(cap[i], cap[i + 1], cap[i + 2]);
        partOrigin.push(CUT_FACE_ID);
        bodyIdx.push(cap[i], cap[i + 2], cap[i + 1]);
        bodyOrigin.push(CUT_FACE_ID);
      }
    }
    parts.push(compact(mesh.positions, partIdx, partOrigin));
  }
  for (let t = 0; t < triCount; t++) {
    if (inIsland[t]) continue;
    bodyIdx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
    bodyOrigin.push(t);
  }
  return { body: compact(mesh.positions, bodyIdx, bodyOrigin), parts };
}

function compact(positions: Float32Array, idx: number[], origin: number[]): SplitMesh {
  const tmp: MeshData = { positions, indices: Uint32Array.from(idx) };
  const all = new Uint32Array(origin.length);
  for (let i = 0; i < all.length; i++) all[i] = i;
  const { mesh } = extractTriangles(tmp, all);
  return { ...mesh, origin: Uint32Array.from(origin) };
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
  inset = 0,
  ringProfile?: number[],
): MeshData {
  const vmap = new Map<number, number>();
  for (let i = 0; i < tris.length; i++) if (!vmap.has(tris[i])) vmap.set(tris[i], vmap.size);
  const n = vmap.size;
  // squeeze: alt kapak, yamanın ekseni etrafında içe daraltılır (C5)
  let center: Vec3 = [0, 0, 0];
  for (const v of vmap.keys()) center = add(center, vertexAt(positions, v));
  center = scale(center, 1 / Math.max(1, n));
  const k = 1 - Math.min(0.9, Math.max(0, squeeze));
  // inset: her iki halka da eksene doğru mm cinsinden çekilir (ortalama yanal yarıçapa göre oran)
  let meanR = 0;
  for (const v of vmap.keys()) {
    const rel = sub(vertexAt(positions, v), center);
    meanR += Math.hypot(...sub(rel, scale(dir, dot(rel, dir))));
  }
  meanR /= Math.max(1, n);
  const ki = meanR > 0 ? Math.max(0.1, 1 - Math.max(0, inset) / meanR) : 1;
  const [bu, bv] = orthoBasis(dir);
  const profile = ringProfile?.some((x) => x !== 0) ? ringProfile : null;
  // üst köşeler 0..n-1, alt köşeler n..2n-1
  const out = new Float32Array(n * 6);
  for (const [v, i] of vmap) {
    const p = vertexAt(positions, v);
    const rel = sub(p, center);
    const lateral = sub(rel, scale(dir, dot(rel, dir)));
    const top = sub(add(p, scale(dir, eps)), scale(lateral, 1 - ki));
    out.set(top, 3 * i);
    let f = k * ki;
    if (profile) {
      // C6: alt halkanın bu yöndeki radyal düzeltmesi
      const len = Math.hypot(...lateral) * f;
      if (len > 1e-6) {
        const angle = Math.atan2(dot(lateral, bv), dot(lateral, bu));
        f *= Math.max(0.1, (len + ringDelta(profile, angle)) / len);
      }
    }
    const bottom = sub(sub(p, scale(dir, depth)), scale(lateral, 1 - f));
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

/** Profil değeri: 8 yön arasında kosinüsle yumuşak aradeğerleme (periyodik). */
export function ringDelta(profile: number[], angle: number): number {
  const n = profile.length;
  const x = ((angle / (2 * Math.PI)) * n + n) % n;
  const i = Math.floor(x);
  const t = x - i;
  const w = (1 - Math.cos(t * Math.PI)) / 2;
  return profile[i % n] * (1 - w) + profile[(i + 1) % n] * w;
}

/** Tapa alt halkasının kontrol noktaları (önizlemede gösterilir). */
function ringMarkersFor(
  mesh: MeshData,
  island: Island,
  dir: Vec3,
  depth: number,
  profile: number[] | undefined,
): Vec3[] {
  let center: Vec3 = [0, 0, 0];
  let r = 0;
  const loop = island.mainLoop;
  for (const v of loop) center = add(center, vertexAt(mesh.positions, v));
  center = scale(center, 1 / Math.max(1, loop.length));
  for (const v of loop) {
    const rel = sub(vertexAt(mesh.positions, v), center);
    r += Math.hypot(...sub(rel, scale(dir, dot(rel, dir))));
  }
  r /= Math.max(1, loop.length);
  const [bu, bv] = orthoBasis(dir);
  const base = sub(center, scale(dir, depth));
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const rr = Math.max(0.1, r + (profile?.[i] ?? 0));
    return add(base, add(scale(bu, Math.cos(a) * rr), scale(bv, Math.sin(a) * rr)));
  });
}

/** Socket hacmi: ada yüzeyi `dir` boyunca süpürülür. */
function extrudeVolume(
  mesh: MeshData,
  island: Island,
  dir: Vec3,
  depth: number,
  eps: number,
  squeeze = 0,
  inset = 0,
  ringProfile?: number[],
): MeshData {
  const tris: number[] = [];
  for (const t of island.tris)
    tris.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
  return extrudePatch(
    mesh.positions,
    tris,
    island.loops,
    dir,
    depth,
    eps,
    squeeze,
    inset,
    ringProfile,
  );
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
  inset = 0,
  ringProfile?: number[],
): { mesh: MeshData; dir: Vec3 }[] {
  return island.loops.map((loop) => {
    const dir = projection?.(island) ?? loopPlane(positions, loop).normal;
    // triangulateLoop gövdeye bakan kapak verir; süpürme için dışa (dir) bakanı gerekir
    const cap = flipAll(triangulateLoop(positions, loop, dir));
    return {
      mesh: extrudePatch(positions, cap, [loop], dir, depth, eps, squeeze, inset, ringProfile),
      dir,
    };
  });
}

/**
 * Yükseklik alanı olmayan bölgeler için yedek: `dir`'e bakan üçgenler tek
 * parça süpürülür, bakmayanlar için üçgen başına prizma eklenir.
 */
/** Bu sayıdan fazla üçgen başına prizma birleştirilmez (X67). */
const PRISM_LIMIT = 200;

function prismUnion(
  mesh: MeshData,
  island: Island,
  dir: Vec3,
  depth: number,
  eps: number,
  scope: Scope,
  warnings: string[] = [],
): Manifold {
  const { normals, areas } = meshTopology(mesh);
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
      pieces.push(
        scope.keep(
          toManifold(extrudePatch(mesh.positions, good, loops, dir, depth, eps), CUT_FACE_ID),
        ),
      );
      sweptAll = true;
    } catch (e) {
      if (!(e instanceof KernelError)) throw e;
    }
  }
  // süpürme başarısızsa tüm üçgenler prizma olur
  let prismTris = sweptAll ? bad : island.tris;
  if (prismTris.length > PRISM_LIMIT) {
    if (sweptAll && pieces.length) {
      warnings.push('Bölge çok yoğun; süpürme kullanıldı, arkaya bakan üçgenler atlandı.');
      return pieces.length === 1 ? pieces[0] : scope.keep(kernel().Manifold.union(pieces));
    }
    prismTris = prismTris
      .slice()
      .sort((a, b) => areas[b] - areas[a])
      .slice(0, PRISM_LIMIT);
    warnings.push('Bölge çok yoğun; prizmalar seyreltilerek birleştirildi.');
  }
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
  if (!pieces.length)
    throw new CutError(
      island.tris.length > PRISM_LIMIT
        ? 'Bölge çok yoğun. Daha küçük bir renk seçin veya Pimli kes kullanın.'
        : 'Bölge seçilen yöne paralel; hacim üretilemedi.',
    );
  return pieces.length === 1 ? pieces[0] : scope.keep(kernel().Manifold.union(pieces));
}

function flipAll(idx: number[]): number[] {
  const out = idx.slice();
  for (let i = 0; i < out.length; i += 3) [out[i + 1], out[i + 2]] = [out[i + 2], out[i + 1]];
  return out;
}

/**
 * X65: yuva payı. Yan yüzler `c` kadar dışarı, en derin taban `c` kadar içeri
 * kayar. Kaydırılmış kopyaların birleşimi, birbirine çok yakın üçgenlerde
 * boolean'ı bitirmiyordu.
 */
function growVolume(vol: Manifold, dir: Vec3, c: number, scope: Scope): Manifold {
  if (c <= 0) return vol;
  const src = vol.getMesh();
  const stride = src.numProp;
  const n = src.numVert;
  const pos = src.vertProperties;
  const tri = src.triVerts;
  const vn = new Float32Array(n * 3);
  for (let t = 0; t < src.numTri; t++) {
    const ia = tri[3 * t];
    const ib = tri[3 * t + 1];
    const ic = tri[3 * t + 2];
    const ax = pos[stride * ia];
    const ay = pos[stride * ia + 1];
    const az = pos[stride * ia + 2];
    const ux = pos[stride * ib] - ax;
    const uy = pos[stride * ib + 1] - ay;
    const uz = pos[stride * ib + 2] - az;
    const wx = pos[stride * ic] - ax;
    const wy = pos[stride * ic + 1] - ay;
    const wz = pos[stride * ic + 2] - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    for (const i of [ia, ib, ic]) {
      vn[3 * i] += nx;
      vn[3 * i + 1] += ny;
      vn[3 * i + 2] += nz;
    }
  }
  let minD = Infinity;
  const along = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d =
      pos[stride * i] * dir[0] + pos[stride * i + 1] * dir[1] + pos[stride * i + 2] * dir[2];
    along[i] = d;
    if (d < minD) minD = d;
  }
  const out = new Float32Array(pos);
  for (let i = 0; i < n; i++) {
    let nx = vn[3 * i];
    let ny = vn[3 * i + 1];
    let nz = vn[3 * i + 2];
    const nd = nx * dir[0] + ny * dir[1] + nz * dir[2];
    nx -= dir[0] * nd;
    ny -= dir[1] * nd;
    nz -= dir[2] * nd;
    const llen = Math.hypot(nx, ny, nz);
    const o = stride * i;
    if (llen > 1e-8) {
      out[o] += (nx / llen) * c;
      out[o + 1] += (ny / llen) * c;
      out[o + 2] += (nz / llen) * c;
    }
    if (along[i] <= minD + 1e-4) {
      out[o] -= dir[0] * c;
      out[o + 1] -= dir[1] * c;
      out[o + 2] -= dir[2] * c;
    }
  }
  src.vertProperties = out;
  return scope.keep(new (kernel().Manifold)(src));
}

function withFaceId(man: Manifold, id: number, scope: Scope): Manifold {
  const mesh = man.getMesh();
  mesh.faceID = new Uint32Array(mesh.numTri).fill(id);
  return scope.keep(new (kernel().Manifold)(mesh));
}

function pinDepthClearance(opts: CutOptions): number {
  return opts.pin.depthClearance ?? opts.clearance;
}

/** `axis` boyunca uzanan, `center`'da ortalanmış pim. `growLength`: boyca (her uçta) büyüme. */
export function makePin(
  pin: PinOptions,
  center: Vec3,
  axis: Vec3,
  grow: number,
  scope: Scope,
  growLength = grow,
): Manifold {
  const { Manifold } = kernel();
  const r = pin.radius + grow;
  const h = pin.length + 2 * growLength;
  let shape: Manifold;
  // snapPin kendi ürettiklerini scope'a ekliyor; iki kez eklenirse iki kez silinir
  if (pin.shape === 'snap') shape = snapPin(pin, grow, scope, growLength);
  else {
    const segments = pin.shape === 'octagon' ? 8 : 32;
    const block = (rr: number, hh: number) =>
      scope.keep(
        pin.shape === 'cube'
          ? Manifold.cube([2 * rr, 2 * rr, hh], true)
          : Manifold.cylinder(hh, rr, rr, segments, true),
      );
    // pah sadece pimin kendisinde; en fazla yarıçapın ve boyun üçte biri
    const c = grow === 0 ? Math.min(pin.chamfer ?? 0, r / 3, h / 3) : 0;
    shape =
      c > 0.01 ? scope.keep(Manifold.hull([block(r, h - 2 * c), block(r - c, h)])) : block(r, h);
  }
  const [u, v] = orthoBasis(axis);
  // sütun öncelikli 4x4: x->u, y->v, z->axis, öteleme->center
  const m = [...u, 0, ...v, 0, ...axis, 0, ...center, 1] as unknown as Parameters<
    Manifold['transform']
  >[0];
  return withFaceId(scope.keep(shape.transform(m)), CUT_FACE_ID, scope);
}

/**
 * C11: yapıştırıcısız snap pim (yerel z ekseni boyunca, ortası 0'da).
 * Yuvaya giren ucunda kanca (tırnak): uca doğru daralan koni, arkasında
 * basamak; ortadan yarık iki yarının sıkışıp geçmesini sağlar. `grow > 0`
 * yuvayı üretir: düz delik + tırnağın oturduğu oluk.
 */
function snapPin(pin: PinOptions, grow: number, scope: Scope, growLength = grow): Manifold {
  const { Manifold } = kernel();
  const r = pin.radius;
  const L = pin.length;
  const bulge = Math.max(0.3, 0.15 * r);
  const barb = Math.min(2, L / 4);
  // tırnak yuvanın olduğu uçta: pim parçadaysa +z (gövdeye), değilse -z
  const tip = pin.onPart ? 1 : -1;
  const barbStart = L / 2 - barb - 0.2; // tırnağın basamaklı (geniş) ucu
  const place = (m: Manifold, z0: number) => {
    scope.keep(m);
    // yerel parça 0..yükseklik aralığında: tip -1 ise z'de aynalanır
    return scope.keep(
      tip > 0 ? m.translate([0, 0, z0]) : m.mirror([0, 0, 1]).translate([0, 0, -z0]),
    );
  };
  if (grow > 0) {
    // yuva: düz delik + tırnak oluğu (tırnaktan grow kadar geniş ve uzun)
    const hole = scope.keep(Manifold.cylinder(L + 2 * growLength, r + grow, r + grow, 32, true));
    const groove = place(
      Manifold.cylinder(barb + 2 * grow, r + bulge + grow, r + bulge + grow, 32),
      barbStart - grow,
    );
    return scope.keep(hole.add(groove));
  }
  const body = scope.keep(Manifold.cylinder(L, r, r, 32, true));
  // tırnak: geniş basamaktan uca doğru daralan koni
  const cone = place(Manifold.cylinder(barb, r + bulge, r, 32), barbStart);
  // yarık: tırnaklı yarıyı ikiye böler
  const slitW = Math.max(0.6, 0.35 * r);
  const slitLen = (L / 2) * 0.8;
  const slit = place(
    Manifold.cube([2 * (r + bulge) + 1, slitW, slitLen + 1], false).translate([
      -(r + bulge) - 0.5,
      -slitW / 2,
      0,
    ]),
    L / 2 - slitLen,
  );
  return scope.keep(scope.keep(body.add(cone)).subtract(slit));
}

function pinCenters(
  positions: Float32Array,
  islands: Island[],
  pins: PinPlacement[] | undefined,
  base: PinOptions,
): { island: Island; center: Vec3; surface: Vec3; axis: Vec3; spec: PinOptions }[] {
  const raw: { island: Island; pin: PinPlacement }[] =
    !pins || pins.length === 0
      ? islands.flatMap((island) =>
          (base.auto ? autoPinPoints(positions, island) : [island.capCenter]).map((point) => ({
            island,
            pin: { point },
          })),
        )
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
    const n = island.capNormal;
    const onPlane = sub(pin.point, scale(n, dot(sub(pin.point, island.capCenter), n)));
    let center = onPlane;
    try {
      center =
        lineCapIntersection(positions, triangulateLoop(positions, island.mainLoop), onPlane, n) ??
        onPlane;
    } catch {
      // kapak üçgenlenemedi (düzlem kesimi): pim düzlemde
    }
    // eksen gövdeye doğru bakmalı (kapak normalinin tersi yönde)
    let axis = pin.axis ? normalize(pin.axis) : scale(n, -1);
    if (dot(axis, n) > 0) axis = scale(axis, -1);
    let { radius, length } = base;
    if (base.auto) {
      const shared = raw.filter((r) => r.island === island).length;
      ({ radius, length } = autoPinSize(positions, island, center, shared));
    }
    const spec = { ...base, radius: pin.radius ?? radius, length: pin.length ?? length };
    // pimin gövde tarafındaki payı: merkez eksen boyunca kaydırılır (eksen gövdeye bakıyor)
    const ratio = Math.min(0.95, Math.max(0.05, pin.bodyRatio ?? base.bodyRatio ?? 0.5));
    const shifted = add(center, scale(axis, (ratio - 0.5) * spec.length));
    return { island, center: shifted, surface: center, axis, spec };
  });
}

/**
 * X45: otomatik pim yerleri. Kesim halkası kapak düzleminde asal eksenlerine
 * ayrılır; uzun eksen kısa eksenin 2 katından uzunsa iki, 3.5 katından
 * uzunsa üç pim uzun eksen boyunca eşit aralıkla dizilir (tek pim uzun
 * kesitte parçanın dönmesine izin verir). Aksi halde kesit merkezine bir pim.
 */
export function autoPinPoints(positions: Float32Array, island: Island): Vec3[] {
  const [u, v] = orthoBasis(island.capNormal);
  const c = island.capCenter;
  const pts = island.mainLoop.map((i) => {
    const d = sub(vertexAt(positions, i), c);
    return [dot(d, u), dot(d, v)] as [number, number];
  });
  if (pts.length < 3) return [c];
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  // 2x2 kovaryansın büyük özvektörü
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const major: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const minor: [number, number] = [-major[1], major[0]];
  const span = (d: [number, number]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, y] of pts) {
      const t = x * d[0] + y * d[1];
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    return [lo, hi];
  };
  const [a0, a1] = span(major);
  const [b0, b1] = span(minor);
  const long = a1 - a0;
  const short = Math.max(b1 - b0, 1e-6);
  const count = long / short >= 3.5 ? 3 : long / short >= 2 ? 2 : 1;
  if (count === 1) return [c];
  const mid = (a0 + a1) / 2;
  const mb = (b0 + b1) / 2;
  const dir = add(scale(u, major[0]), scale(v, major[1]));
  const side = add(scale(u, minor[0]), scale(v, minor[1]));
  const base = add(add(c, scale(dir, mid)), scale(side, mb));
  const step = long / (count + 1);
  return Array.from({ length: count }, (_, k) =>
    add(base, scale(dir, (k - (count - 1) / 2) * step)),
  );
}

/**
 * X33: kesite göre pim boyutu. Kesim halkasına en yakın uzaklığın %35'i
 * (pim + boşluk + duvar sığsın) ve pim başına düşen kesit alanının eşdeğer
 * yarıçapının %30'u; küçüğü alınır, 0.8–6 mm'ye sınırlanır.
 */
export function autoPinSize(
  positions: Float32Array,
  island: Island,
  center: Vec3,
  pinsOnIsland = 1,
): { radius: number; length: number } {
  const n = island.capNormal;
  let inner = Infinity;
  const loop = island.mainLoop;
  for (let i = 0; i < loop.length; i++) {
    const a = vertexAt(positions, loop[i]);
    const b = vertexAt(positions, loop[(i + 1) % loop.length]);
    // kapak düzlemine izdüşümde merkezin kenar parçasına uzaklığı
    const pa = sub(a, scale(n, dot(sub(a, center), n)));
    const pb = sub(b, scale(n, dot(sub(b, center), n)));
    const ab = sub(pb, pa);
    const s = Math.max(0, Math.min(1, dot(sub(center, pa), ab) / (dot(ab, ab) || 1e-12)));
    inner = Math.min(inner, Math.hypot(...sub(center, add(pa, scale(ab, s)))));
  }
  // Newell: halka alanı
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = vertexAt(positions, loop[i]);
    const b = vertexAt(positions, loop[(i + 1) % loop.length]);
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const area = Math.hypot(nx, ny, nz) / 2;
  const equiv = Math.sqrt(area / (Math.PI * Math.max(1, pinsOnIsland)));
  const radius =
    Math.round(Math.min(6, Math.max(0.8, Math.min(0.35 * inner, 0.3 * equiv))) * 10) / 10;
  return { radius, length: Math.round(Math.min(24, Math.max(3, 4 * radius)) * 2) / 2 };
}

/** `origin + s*dir` doğrusunun kapak üçgenleriyle kesiştiği nokta. */
function lineCapIntersection(
  positions: Float32Array,
  cap: number[],
  origin: Vec3,
  dir: Vec3,
): Vec3 | null {
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

function depthOf(island: Island, opts: CutOptions): number {
  return opts.depthByIsland?.[island.key] ?? opts.depth;
}

function socketDirection(island: Island, opts: CutOptions): Vec3 {
  return opts.direction ? normalize(opts.direction) : island.normal;
}

function isHeightField(mesh: MeshData, island: Island, dir: Vec3): boolean {
  const { normals, areas } = meshTopology(mesh);
  for (const t of island.tris) {
    if (areas[t] < 1e-9) continue;
    const nd = normals[3 * t] * dir[0] + normals[3 * t + 1] * dir[1] + normals[3 * t + 2] * dir[2];
    if (nd < 0.02) return false;
  }
  return true;
}

function socketVolume(
  mesh: MeshData,
  island: Island,
  opts: CutOptions,
  eps: number,
  scope: Scope,
  warnings: string[],
): Manifold {
  const dir = socketDirection(island, opts);
  if (isHeightField(mesh, island, dir)) {
    return scope.keep(
      toManifold(
        extrudeVolume(
          mesh,
          island,
          dir,
          depthOf(island, opts),
          eps,
          opts.squeeze,
          opts.inset,
          opts.ringProfile,
        ),
        CUT_FACE_ID,
      ),
    );
  }
  warnings.push('Bölge seçilen yönden tam görünmüyor; yedek yöntem (süpürme + prizma) kullanıldı.');
  return prismUnion(mesh, island, dir, depthOf(island, opts), eps, scope, warnings);
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
/** Pim yerleşimi (arayüzde pimi gerçek boyutuyla göstermek için). */
export interface PinLayout {
  /** Kesim yüzeyindeki nokta (pimin yüzeyle kesiştiği yer). */
  surface: Vec3;
  /** Gövdeye bakan birim eksen. */
  axis: Vec3;
  radius: number;
  length: number;
  /** Pim merkezi (gövde payına göre eksen boyunca kaydırılmış). */
  center: Vec3;
  shape: PinShape;
}

/**
 * Keys pimlerinin kesimde kullanılacak yeri, ekseni ve boyutu (otomatik boyut
 * ve otomatik yerleşim dahil). Kesim yapmaz; bölge yoksa boş.
 */
export function pinLayout(mesh: LabeledMesh, opts: CutOptions): PinLayout[] {
  const islands = findIslands(mesh, opts.slot);
  if (!islands.length) return [];
  return pinCenters(mesh.positions, islands, opts.pins, opts.pin).map((p) => ({
    surface: p.surface,
    axis: p.axis,
    radius: p.spec.radius,
    length: p.spec.length,
    center: p.center,
    shape: p.spec.shape,
  }));
}

export function previewCut(mesh: LabeledMesh, opts: CutOptions, model?: ModelProvider): CutPreview {
  return withModel(model, () => previewCutImpl(mesh, opts));
}

function previewCutImpl(mesh: LabeledMesh, opts: CutOptions): CutPreview {
  if (opts.seamLoop && opts.seamLoop.length >= 3) return seamPreview(mesh, opts.seamLoop, opts);
  const scope = new Scope();
  const warnings: string[] = [];
  try {
    const islands = findIslands(mesh, opts.slot, warnings);
    const volumes: MeshData[] = [];
    const pins: MeshData[] = [];
    const ringMarkers: Vec3[] = [];
    if (opts.mode === 'socket' && islands[0]) {
      const i0 = islands[0];
      const dir0 = shouldSweepSocket(mesh, islands, opts)
        ? socketDirection(i0, opts)
        : (capProjections(opts)[0]?.(i0) ?? i0.capNormal);
      ringMarkers.push(...ringMarkersFor(mesh, i0, dir0, depthOf(i0, opts), opts.ringProfile));
    }
    // duvar kontrolü için: [yuvayı içeren katı, yuva hacmi (büyütülmüş), içeri bakan yön, yüzeydeki referans nokta, ad]
    const cavities: {
      container: () => Manifold;
      grown: () => Manifold;
      inward: Vec3;
      ref: Vec3;
      slack: number;
      name: string;
    }[] = [];
    // kesim halkası düzlemden ne kadar sapıyor: yuvanın ağzı bu kadar derinliğe kadar yüzeye açılabilir
    const slackOf = (island: Island, normal: Vec3) => {
      let m = 0;
      for (const v of island.mainLoop)
        m = Math.max(m, Math.abs(dot(sub(vertexAt(mesh.positions, v), island.capCenter), normal)));
      return m;
    };
    const minWall = opts.minWall ?? 0;
    let model: Manifold | null = null;
    const modelM = () => (model ??= modelOf(mesh, scope));

    if (opts.mode === 'socket' && !shouldSweepSocket(mesh, islands, opts)) {
      // çıkıntı yöntemi: kesim kapakları ve gövdeye giren tapa prizmaları
      const eps = Math.max(1, 4 * opts.clearance);
      for (const island of islands) {
        for (const { mesh: vol, dir } of capPlugVolumes(
          mesh.positions,
          island,
          depthOf(island, opts),
          eps,
          capProjections(opts)[0],
          opts.squeeze,
          opts.inset,
          opts.ringProfile,
        )) {
          volumes.push(vol);
          cavities.push({
            container: modelM,
            grown: () =>
              growVolume(
                scope.keep(toManifold(vol, CUT_FACE_ID)),
                dir,
                opts.clearance + minWall,
                scope,
              ),
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
          ? extrudeVolume(
              mesh,
              island,
              dir,
              depthOf(island, opts),
              eps,
              opts.squeeze,
              opts.inset,
              opts.ringProfile,
            )
          : manifoldMesh(socketVolume(mesh, island, opts, eps, scope, warnings));
        volumes.push(vol);
        cavities.push({
          container: modelM,
          grown: () =>
            growVolume(
              scope.keep(toManifold(vol, CUT_FACE_ID)),
              dir,
              opts.clearance + minWall,
              scope,
            ),
          inward: scale(dir, -1),
          ref: island.capCenter,
          slack: slackOf(island, dir),
          name: 'Tapa yuvası',
        });
      }
    } else {
      for (const island of islands) {
        if (opts.planar) {
          volumes.push(planePatch(mesh.positions, island));
          continue;
        }
        const idx: number[] = [];
        for (const loop of island.loops) idx.push(...triangulateLoop(mesh.positions, loop));
        volumes.push(
          extractTriangles(
            { positions: mesh.positions, indices: Uint32Array.from(idx) },
            range(idx.length / 3),
          ).mesh,
        );
      }
      if (opts.mode === 'keys') {
        const placed = pinCenters(mesh.positions, islands, opts.pins, opts.pin);
        let split: { body: Manifold; parts: Manifold[] } | null = null;
        const splitM = () => {
          if (!split) {
            const sp = capSplit(mesh, islands);
            split = {
              body: scope.keep(toManifold(sp.body, sp.body.origin)),
              parts: sp.parts.map((p) => scope.keep(toManifold(p, p.origin))),
            };
          }
          return split;
        };
        for (const [k, { island, center, surface, axis, spec }] of placed.entries()) {
          pins.push(manifoldMesh(makePin(spec, center, axis, 0, scope)));
          // yuva, pimin karşı tarafındaki katıda açılır
          const inward = opts.pin.onPart ? axis : scale(axis, -1);
          cavities.push({
            container: () =>
              opts.pin.onPart ? splitM().body : splitM().parts[islands.indexOf(island)],
            grown: () =>
              makePin(
                spec,
                center,
                axis,
                opts.clearance + minWall,
                scope,
                pinDepthClearance(opts) + minWall,
              ),
            inward,
            ref: surface,
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
            warnings.push(
              `${c.name} çevresinde duvar ${minWall} mm'den ince (kırmızı). Derinliği/pimi küçültün veya yerini değiştirin.`,
            );
          }
        } catch (e) {
          if (!(e instanceof KernelError)) throw e;
        }
      }
    }
    return { volumes, pins, thin, ringMarkers, warnings };
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
export function cutRegion(mesh: LabeledMesh, opts: CutOptions, model?: ModelProvider): CutResult {
  return withModel(model, () =>
    opts.seamLoop && opts.seamLoop.length >= 3
      ? seamCut(mesh, opts.seamLoop, opts)
      : cutRegionImpl(mesh, opts),
  );
}

function cutRegionImpl(mesh: LabeledMesh, opts: CutOptions): CutResult {
  const scope = new Scope();
  try {
    const warnings: string[] = [];
    const islands = findIslands(mesh, opts.slot, warnings);
    try {
      const r = cutIslands(mesh, islands, opts, scope, warnings);
      // hacimsiz parça (ör. yön bölgeye paralel) başarı sayılmaz
      const parts = r.parts.filter((p) => Math.abs(signedVolume(p)) >= 1e-3);
      if (parts.length < r.parts.length)
        r.warnings.push(`${r.parts.length - parts.length} hacimsiz parça atlandı.`);
      if (!parts.length)
        throw new CutError('Kesim hacimli bir parça üretmedi (yön bölgeye paralel olabilir).');
      return { ...r, parts };
    } catch (e) {
      // D5: hatanın hangi bölgede olduğunu göster
      if (e instanceof CutError && !e.loops) {
        e.loops = islands.flatMap((i) =>
          i.loops.map((loop) => loop.map((v) => vertexAt(mesh.positions, v))),
        );
      }
      throw e;
    }
  } finally {
    scope.dispose();
  }
}

function cutIslands(
  mesh: LabeledMesh,
  islands: Island[],
  opts: CutOptions,
  scope: Scope,
  warnings: string[],
): CutResult {
  {
    if (opts.mode === 'socket') return socketCut(mesh, islands, opts, scope, warnings);

    let body: Manifold;
    let parts: Manifold[];
    if (opts.planar) {
      ({ body, parts } = planeSplit(mesh, islands, scope, opts.faceGap ?? 0));
    } else {
      try {
        const split = capSplit(mesh, islands);
        body = scope.keep(toManifold(split.body, split.body.origin));
        parts = split.parts.map((p) => scope.keep(toManifold(p, p.origin)));
        if ((opts.faceGap ?? 0) > 0)
          warnings.push(
            'Yüz boşluğu düz kesimde uygulanır. Bu kesim çizgiyi izledi; yüzler birbirine değer.',
          );
      } catch (e) {
        if (!(e instanceof KernelError || e instanceof CutError)) throw e;
        // X4: sınırdan kapak olmadı, en uygun düzlemle kes
        ({ body, parts } = planeSplit(mesh, islands, scope, opts.faceGap ?? 0));
        warnings.push('Sınır halkasından kapak üretilemedi; bölge en uygun düzlemle kesildi.');
      }
    }

    if (opts.mode === 'keys') {
      const placed = pinCenters(mesh.positions, islands, opts.pins, opts.pin);
      for (const [k, { island, center, axis, spec }] of placed.entries()) {
        const i = islands.indexOf(island);
        const pin = makePin(spec, center, axis, 0, scope);
        const hole = makePin(spec, center, axis, opts.clearance, scope, pinDepthClearance(opts));
        checkPinContainment(
          pin,
          parts[i],
          body,
          spec,
          warnings,
          placed.length > 1 ? `Pim ${k + 1}` : 'Pim',
        );
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
      body: fromManifoldMapped(body, mesh.labels, BASE_SLOT),
      parts: parts.map((p) => partFrom(p, mesh.labels, opts.slot)),
      warnings,
    };
  }
}

/**
 * X4: her ada, sınır halkasının Newell düzlemiyle kesilir. Düzlemin bölge
 * tarafı büyük bir kutuyla alınır (yeni yüzler CUT_FACE_ID taşır), parçalara
 * ayrılır ve bölgeyi içeren parça seçilir. Gövde = model − parçalar.
 */
/** Düzlemin bir tarafı: yerel z, `z0`'dan `z0 + R`'ye. `z0` 0 ise düzlemden normal yönüne. */
function halfBox(scope: Scope, normal: Vec3, origin: Vec3, z0: number, R: number): Manifold {
  const { Manifold } = kernel();
  const [u, v] = orthoBasis(normal);
  const box = scope.keep(Manifold.cube([2 * R, 2 * R, R], false).translate([-R, -R, z0]));
  const m = [...u, 0, ...v, 0, ...normal, 0, ...origin, 1] as unknown as Parameters<
    Manifold['transform']
  >[0];
  return withFaceId(scope.keep(box.transform(m)), CUT_FACE_ID, scope);
}

function planeSplit(
  mesh: LabeledMesh,
  islands: Island[],
  scope: Scope,
  faceGap = 0,
): { body: Manifold; parts: Manifold[] } {
  const { Manifold } = kernel();
  const model = modelOf(mesh, scope);
  const { min, max } = boundingBoxOf(mesh.positions);
  const R = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 2 + 1;
  const gap = Math.max(0, faceGap);
  const parts: Manifold[] = [];
  const removed: Manifold[] = [];
  for (const island of islands) {
    const n = island.capNormal;
    const origin = island.capCenter;
    const half = halfBox(scope, n, origin, gap / 2, R);
    const side = scope.keep(model.intersect(half));
    // bölgeyi içeren parça: bölge üçgeninin biraz içindeki noktayı içeren bileşen
    const probe = regionProbe(mesh, island);
    const dot0 = scope.keep(Manifold.sphere(0.05, 8).translate(probe));
    let chosen: Manifold | null = null;
    for (const piece of side.decompose()) {
      scope.keep(piece);
      if (!chosen && scope.keep(piece.intersect(dot0)).volume() > 0) chosen = piece;
    }
    if (!chosen)
      throw new CutError(
        'Düzlem kesimi bölgeyi içeren bir parça üretmedi (düzlem bölgenin arkasında kalıyor olabilir).',
      );
    parts.push(chosen);
    if (gap > 0) {
      const wide = scope.keep(model.intersect(halfBox(scope, n, origin, -gap / 2, R)));
      const dot1 = scope.keep(Manifold.sphere(0.05, 8).translate(probe));
      let cutAway: Manifold | null = null;
      for (const piece of wide.decompose()) {
        scope.keep(piece);
        if (!cutAway && scope.keep(piece.intersect(dot1)).volume() > 0) cutAway = piece;
      }
      if (cutAway) removed.push(cutAway);
    }
  }
  const gone = gap > 0 ? removed : parts;
  const body = scope.keep(
    model.subtract(gone.length === 1 ? gone[0] : scope.keep(Manifold.union(gone))),
  );
  return { body, parts };
}

/** Önizleme için düzlem kesiminin düzlemi: halka boyutunda bir kare. */
function planePatch(positions: Float32Array, island: Island): MeshData {
  const n = island.capNormal;
  const [u, v] = orthoBasis(n);
  const c = island.capCenter;
  let r = 0;
  for (const i of island.mainLoop) r = Math.max(r, Math.hypot(...sub(vertexAt(positions, i), c)));
  r *= 1.3;
  const corners = [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ].flatMap(([a, b]) => add(c, add(scale(u, a), scale(v, b))));
  return { positions: Float32Array.from(corners), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) };
}

/** Adanın en büyük üçgeninin merkezinden yüzeyin biraz içine giren nokta. */
function regionProbe(mesh: MeshData, island: Island): Vec3 {
  const { normals, areas } = meshTopology(mesh);
  let best = island.tris[0];
  for (const t of island.tris) if (areas[t] > areas[best]) best = t;
  const c: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const p = vertexAt(mesh.positions, mesh.indices[3 * best + k]);
    c[0] += p[0] / 3;
    c[1] += p[1] / 3;
    c[2] += p[2] / 3;
  }
  const n: Vec3 = [normals[3 * best], normals[3 * best + 1], normals[3 * best + 2]];
  return sub(c, scale(n, Math.min(0.1, Math.sqrt(areas[best]) * 0.2)));
}

function boundingBoxOf(positions: Float32Array) {
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    min = [
      Math.min(min[0], positions[i]),
      Math.min(min[1], positions[i + 1]),
      Math.min(min[2], positions[i + 2]),
    ];
    max = [
      Math.max(max[0], positions[i]),
      Math.max(max[1], positions[i + 1]),
      Math.max(max[2], positions[i + 2]),
    ];
  }
  return { min, max };
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
function shouldSweepSocket(mesh: MeshData, islands: Island[], opts: CutOptions): boolean {
  return islands.every((i) => isHeightField(mesh, i, socketDirection(i, opts)));
}

function socketCut(
  mesh: LabeledMesh,
  islands: Island[],
  opts: CutOptions,
  scope: Scope,
  warnings: string[],
): CutResult {
  if (!shouldSweepSocket(mesh, islands, opts)) {
    try {
      return capSocketCut(mesh, islands, opts, scope, warnings);
    } catch (e) {
      if (!(e instanceof CutError || e instanceof KernelError)) throw e;
    }
    const r = sweepSocketCut(mesh, islands, opts, scope, []);
    const note =
      'Bölge alttan oyuk (tek yönden tam görünmüyor); yedek yöntemle kesildi. Tapanın oturmasını önizlemede kontrol edin.';
    return {
      ...r,
      warnings: [
        ...warnings,
        note,
        ...r.warnings.filter((w) => !w.startsWith('Bölge seçilen yönden')),
      ],
    };
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

function capSocketCut(
  mesh: LabeledMesh,
  islands: Island[],
  opts: CutOptions,
  scope: Scope,
  warnings: string[],
): CutResult {
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

function capSocketCutWith(
  mesh: LabeledMesh,
  islands: Island[],
  opts: CutOptions,
  scope: Scope,
  projection: Projection,
): CutResult {
  const warnings: string[] = [];
  const split = capSplit(mesh, islands, projection);
  const bodyBase = scope.keep(toManifold(split.body, split.body.origin));
  // gövdeye giren kısım orijinal modelden alınır: kapağın üstüne de biraz taşar,
  // çıkıntıyla çakışan yüzey yerine hacim olarak üst üste biner
  const model = modelOf(mesh, scope);
  const eps = Math.max(1, 4 * opts.clearance);
  const parts: LabeledMesh[] = [];
  const holes: Manifold[] = [];
  islands.forEach((island, i) => {
    let part = scope.keep(toManifold(split.parts[i], split.parts[i].origin));
    for (const { mesh: volMesh, dir } of capPlugVolumes(
      mesh.positions,
      island,
      depthOf(island, opts),
      eps,
      projection,
      opts.squeeze,
      opts.inset,
      opts.ringProfile,
    )) {
      const vol = scope.keep(toManifold(volMesh, CUT_FACE_ID));
      part = scope.keep(part.add(scope.keep(vol.intersect(model))));
      holes.push(growVolume(vol, dir, opts.clearance, scope));
    }
    if (part.volume() < 1e-3) throw new CutError('Tapa hacmi boş çıktı.');
    parts.push(partFrom(part, mesh.labels, opts.slot));
  });
  const allHoles = holes.length === 1 ? holes[0] : scope.keep(kernel().Manifold.union(holes));
  const body = scope.keep(bodyBase.subtract(allHoles));
  return { body: fromManifoldMapped(body, mesh.labels, BASE_SLOT), parts, warnings };
}

function sweepSocketCut(
  mesh: LabeledMesh,
  islands: Island[],
  opts: CutOptions,
  scope: Scope,
  warnings: string[],
): CutResult {
  const model = modelOf(mesh, scope);
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
    parts.push(partFrom(part, mesh.labels, opts.slot));
    holes.push(growVolume(vol, socketDirection(island, opts), opts.clearance, scope));
  }
  if (!parts.length) throw new CutError('Hiç tapa üretilemedi.');
  const allHoles = holes.length === 1 ? holes[0] : scope.keep(kernel().Manifold.union(holes));
  const body = scope.keep(model.subtract(allHoles));
  return { body: fromManifoldMapped(body, mesh.labels, BASE_SLOT), parts, warnings };
}

/** Kesilen parçadaki taban etiketli yüzler parçanın slotunu alır; başka slotlar korunur. */
function partFrom(man: Manifold, labels: Uint16Array, slot: number): LabeledMesh {
  const m = fromManifoldMapped(man, labels, slot);
  for (let t = 0; t < m.labels.length; t++) if (m.labels[t] === BASE_SLOT) m.labels[t] = slot;
  return m;
}

const SEAM_DEVIATION = 0.15;

/**
 * X56: halkanın düzleme yakınlığı ve düzlemin katıyı tek yerden kesmesi.
 * Sapma veya birden fazla kesişim halkası kesimi durdurur.
 */
export function assessSeam(
  mesh: MeshData,
  loop: number[],
): { normal: Vec3; center: Vec3; radius: number } {
  if (loop.length < 3) throw new CutError('Halka için en az 3 nokta gerekli.');
  const plane = loopPlane(mesh.positions, loop);
  let radius = 0;
  let deviation = 0;
  for (const v of loop) {
    const d = sub(vertexAt(mesh.positions, v), plane.center);
    deviation = Math.max(deviation, Math.abs(dot(d, plane.normal)));
    const along = Math.abs(dot(d, plane.normal));
    radius = Math.max(radius, Math.sqrt(Math.max(0, dot(d, d) - along * along)));
  }
  const drawn = loop.map((v) => vertexAt(mesh.positions, v));
  if (radius < 1e-6) throw new CutError('Halka bir noktaya çöküyor.', [drawn]);
  if (deviation > SEAM_DEVIATION * radius)
    throw new CutError('Halka düzlemden çok sapıyor. Daha düz bir yerden çizin.', [drawn]);
  const sections = planeSectionLoops(mesh, plane.center, plane.normal);
  if (sections.length !== 1)
    throw new CutError(
      sections.length === 0
        ? 'Düzlem modeli kesmiyor.'
        : 'Düzlem modeli birden fazla yerden kesiyor. Halkayı daha dar bir yerden geçirin.',
      [drawn],
    );
  const section = sections[0];
  const mid = section.reduce<Vec3>((a, p) => add(a, p), [0, 0, 0]);
  mid[0] /= section.length;
  mid[1] /= section.length;
  mid[2] /= section.length;
  let sectionRadius = 0;
  for (const p of section) {
    const d = sub(p, mid);
    const along = Math.abs(dot(d, plane.normal));
    sectionRadius = Math.max(sectionRadius, Math.sqrt(Math.max(0, dot(d, d) - along * along)));
  }
  const centerGap = Math.hypot(...sub(mid, plane.center));
  if (centerGap > 0.5 * radius || sectionRadius > 1.75 * radius || sectionRadius < 0.45 * radius)
    throw new CutError('Düzlem, çizilen halkanın uzağında bir kesit açıyor.', [drawn]);
  return { normal: plane.normal, center: plane.center, radius };
}

/** Düzlemin mesh ile kesişim halkaları (uç uca eklenen kenar parçaları). */
function planeSectionLoops(mesh: MeshData, origin: Vec3, normal: Vec3): Vec3[][] {
  let reach = 0;
  const p0 = vertexAt(mesh.positions, 0);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const dx = mesh.positions[i] - p0[0];
    const dy = mesh.positions[i + 1] - p0[1];
    const dz = mesh.positions[i + 2] - p0[2];
    reach = Math.max(reach, Math.hypot(dx, dy, dz));
  }
  const eps = Math.max(reach * 1e-6, 1e-7);
  const tol = Math.max(reach * 1e-5, 1e-5);
  const idx = mesh.indices;
  const segs: [Vec3, Vec3][] = [];
  const seen = new Set<string>();
  const grid = (p: Vec3) =>
    `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)},${Math.round(p[2] / tol)}`;
  const addSeg = (a: Vec3, b: Vec3) => {
    const ka = grid(a);
    const kb = grid(b);
    if (ka === kb) return;
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (seen.has(key)) return;
    seen.add(key);
    segs.push([a, b]);
  };
  const at = (v: number) => vertexAt(mesh.positions, v);
  const signed = (v: number) => dot(sub(at(v), origin), normal);
  for (let t = 0; t < idx.length; t += 3) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]];
    const ds = vs.map(signed);
    let onEdge = false;
    for (let e = 0; e < 3; e++) {
      const da = ds[e];
      const db = ds[(e + 1) % 3];
      if (Math.abs(da) <= eps && Math.abs(db) <= eps) {
        addSeg(at(vs[e]), at(vs[(e + 1) % 3]));
        onEdge = true;
      }
    }
    if (onEdge) continue;
    const hits: Vec3[] = [];
    for (let e = 0; e < 3; e++) {
      const da = ds[e];
      const db = ds[(e + 1) % 3];
      if (Math.abs(da) <= eps) hits.push(at(vs[e]));
      else if (da * db < 0) {
        const f = da / (da - db);
        hits.push(add(at(vs[e]), scale(sub(at(vs[(e + 1) % 3]), at(vs[e])), f)));
      }
    }
    if (hits.length >= 2) addSeg(hits[0], hits[1]);
  }
  return chainSegments(segs, tol);
}

function chainSegments(segs: [Vec3, Vec3][], tol: number): Vec3[][] {
  const key = (p: Vec3) =>
    `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)},${Math.round(p[2] / tol)}`;
  const pts = new Map<string, Vec3>();
  const nbr = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = nbr.get(a);
    if (list) list.push(b);
    else nbr.set(a, [b]);
  };
  for (const [p, q] of segs) {
    const kp = key(p);
    const kq = key(q);
    if (kp === kq) continue;
    if (!pts.has(kp)) pts.set(kp, p);
    if (!pts.has(kq)) pts.set(kq, q);
    link(kp, kq);
    link(kq, kp);
  }
  const used = new Set<string>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const loops: Vec3[][] = [];
  for (const start of nbr.keys()) {
    for (const first of nbr.get(start) ?? []) {
      const ek0 = edgeKey(start, first);
      if (used.has(ek0)) continue;
      used.add(ek0);
      const loop = [pts.get(start) as Vec3];
      let prev = start;
      let cur = first;
      while (cur !== start) {
        loop.push(pts.get(cur) as Vec3);
        let next = '';
        for (const n of nbr.get(cur) ?? []) {
          if (n === prev) continue;
          const ek = edgeKey(cur, n);
          if (used.has(ek)) continue;
          next = n;
          used.add(ek);
          break;
        }
        if (!next) break;
        prev = cur;
        cur = next;
      }
      if (cur === start && loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

/**
 * X63: düzlem reddedilince, halka yüzeyi ikiye bölüyorsa kesim o halkayı izler.
 * Bölmüyorsa null.
 */
function seamSurfaceIsland(mesh: MeshData, loop: number[]): Island | null {
  const { adj, areas } = meshTopology(mesh);
  const mask = regionInsideLoop(mesh, adj, areas, loop);
  if (!mask) return null;
  const tris: number[] = [];
  for (let t = 0; t < mask.length; t++) if (mask[t]) tris.push(t);
  if (!tris.length) return null;
  const loops = boundaryLoops(mesh, adj, mask);
  if (loops.length !== 1 || loops[0].length < 3) return null;
  const plane = loopPlane(mesh.positions, loops[0]);
  return {
    tris,
    loops,
    normal: plane.normal,
    capNormal: plane.normal,
    capCenter: plane.center,
    mainLoop: loops[0],
    adj,
    key: tris[0],
  };
}

/** Düzlem uygunsa 'plane', halka yüzeyi bölüyorsa 'surface'. İkisi de değilse assessSeam hatası. */
export function seamSeparates(mesh: MeshData, loop: number[]): 'plane' | 'surface' {
  try {
    assessSeam(mesh, loop);
    return 'plane';
  } catch (e) {
    if (!(e instanceof CutError) || !seamSurfaceIsland(mesh, loop)) throw e;
    return 'surface';
  }
}

function seamCap(
  mesh: LabeledMesh,
  island: Island,
  opts: CutOptions,
  scope: Scope,
): CutResult | null {
  try {
    const split = capSplit(mesh, [island]);
    let body = scope.keep(toManifold(split.body, split.body.origin));
    let part = scope.keep(toManifold(split.parts[0], split.parts[0].origin));
    const warnings: string[] = [];
    if ((opts.faceGap ?? 0) > 0)
      warnings.push(
        'Yüz boşluğu düz kesimde uygulanır. Bu kesim çizgiyi izledi; yüzler birbirine değer.',
      );
    if (opts.mode === 'keys') {
      const placed = pinCenters(mesh.positions, [island], opts.pins, opts.pin);
      for (const [k, pinPlace] of placed.entries()) {
        const pin = makePin(pinPlace.spec, pinPlace.center, pinPlace.axis, 0, scope);
        const hole = makePin(
          pinPlace.spec,
          pinPlace.center,
          pinPlace.axis,
          opts.clearance,
          scope,
          pinDepthClearance(opts),
        );
        checkPinContainment(
          pin,
          part,
          body,
          pinPlace.spec,
          warnings,
          placed.length > 1 ? `Pim ${k + 1}` : 'Pim',
        );
        if (opts.pin.onPart) {
          part = scope.keep(part.add(pin));
          body = scope.keep(body.subtract(hole));
        } else {
          body = scope.keep(body.add(pin));
          part = scope.keep(part.subtract(hole));
        }
      }
    }
    return {
      body: fromManifoldMapped(body, mesh.labels, BASE_SLOT),
      parts: [fromManifoldMapped(part, mesh.labels, BASE_SLOT)],
      warnings,
    };
  } catch (e) {
    if (e instanceof KernelError || e instanceof CutError) return null;
    throw e;
  }
}

/** X56: kapalı yüzey halkasının düzlemiyle iki kapalı parça. Pim, Keys ayarı açıksa. */
function seamCut(mesh: LabeledMesh, loop: number[], opts: CutOptions): CutResult {
  const scope = new Scope();
  try {
    let plane: { normal: Vec3; center: Vec3; radius: number };
    try {
      plane = assessSeam(mesh, loop);
    } catch (e) {
      if (!(e instanceof CutError)) throw e;
      const island = seamSurfaceIsland(mesh, loop);
      const capped = island && seamCap(mesh, island, opts, scope);
      if (!capped) throw e;
      return capped;
    }
    const { Manifold } = kernel();
    const model = modelOf(mesh, scope);
    const { min, max } = boundingBoxOf(mesh.positions);
    const R = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 2 + 1;
    const gap = Math.max(0, opts.faceGap ?? 0);
    const half = halfBox(scope, plane.normal, plane.center, gap / 2, R);
    const side = scope.keep(model.intersect(half));
    const pieces = side.decompose().map((piece) => scope.keep(piece));
    const positive = pieces.length === 1 ? pieces[0] : scope.keep(Manifold.union(pieces));
    const negative =
      gap > 0
        ? scope.keep(model.intersect(halfBox(scope, plane.normal, plane.center, -R - gap / 2, R)))
        : scope.keep(model.subtract(positive));
    const posVol = Math.abs(positive.volume());
    const negVol = Math.abs(negative.volume());
    if (posVol < 1e-3 || negVol < 1e-3)
      throw new CutError('Düzlem modeli iki hacimli parçaya ayıramadı.');
    const positiveIsPart = posVol <= negVol;
    let part = positiveIsPart ? positive : negative;
    let body = positiveIsPart ? negative : positive;
    const normal = positiveIsPart ? plane.normal : scale(plane.normal, -1);
    const warnings: string[] = [];
    if (opts.mode === 'keys') {
      const island: Island = {
        tris: [],
        loops: [loop],
        normal,
        capNormal: normal,
        capCenter: plane.center,
        mainLoop: loop,
        adj: meshTopology(mesh).adj,
        key: 0,
      };
      const placed = pinCenters(mesh.positions, [island], opts.pins, opts.pin);
      for (const [k, pinPlace] of placed.entries()) {
        const pin = makePin(pinPlace.spec, pinPlace.center, pinPlace.axis, 0, scope);
        const hole = makePin(
          pinPlace.spec,
          pinPlace.center,
          pinPlace.axis,
          opts.clearance,
          scope,
          pinDepthClearance(opts),
        );
        checkPinContainment(
          pin,
          part,
          body,
          pinPlace.spec,
          warnings,
          placed.length > 1 ? `Pim ${k + 1}` : 'Pim',
        );
        if (opts.pin.onPart) {
          part = scope.keep(part.add(pin));
          body = scope.keep(body.subtract(hole));
        } else {
          body = scope.keep(body.add(pin));
          part = scope.keep(part.subtract(hole));
        }
      }
    }
    return {
      body: fromManifoldMapped(body, mesh.labels, BASE_SLOT),
      parts: [fromManifoldMapped(part, mesh.labels, BASE_SLOT)],
      warnings,
    };
  } finally {
    scope.dispose();
  }
}

function seamPreview(mesh: LabeledMesh, loop: number[], opts: CutOptions): CutPreview {
  let island: Island;
  try {
    const plane = assessSeam(mesh, loop);
    island = {
      tris: [],
      loops: [loop],
      normal: plane.normal,
      capNormal: plane.normal,
      capCenter: plane.center,
      mainLoop: loop,
      adj: meshTopology(mesh).adj,
      key: 0,
    };
  } catch (e) {
    if (!(e instanceof CutError)) throw e;
    const surface = seamSurfaceIsland(mesh, loop);
    if (!surface) throw e;
    island = surface;
  }
  const scope = new Scope();
  try {
    const pins =
      opts.mode === 'keys'
        ? pinCenters(mesh.positions, [island], opts.pins, opts.pin).map((p) =>
            manifoldMesh(makePin(p.spec, p.center, p.axis, 0, scope)),
          )
        : [];
    return {
      volumes: [planePatch(mesh.positions, island)],
      pins,
      thin: [],
      ringMarkers: [],
      warnings: [],
    };
  } finally {
    scope.dispose();
  }
}

/** D3: kopuk parçaları ayrı mesh'lere böler. */
export function splitComponents(mesh: LabeledMesh): LabeledMesh[] {
  const adj = meshTopology(mesh).adj;
  const triCount = mesh.labels.length;
  const { component, count } = connectedComponents(triCount, adj);
  if (count <= 1) return [mesh];
  const groups: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triCount; t++) groups[component[t]].push(t);
  return groups.map((tris) => {
    const { mesh: sub } = extractTriangles(mesh, tris);
    const cut =
      mesh.cut && mesh.cut.length === triCount
        ? Uint8Array.from(tris, (t) => mesh.cut?.[t] ?? 0)
        : undefined;
    return {
      ...sub,
      labels: Uint16Array.from(tris, (t) => mesh.labels[t]),
      ...(cut ? { cut } : {}),
    };
  });
}

export interface CutSuggestion {
  mode: 'socket' | 'keys';
  /** Kesit (kesim halkası) eşdeğer yarıçapı, mm. */
  capRadius: number;
  /** Ortalama çıkıntı yüksekliği (hacim / kesit alanı), mm. */
  height: number;
  reason: string;
}

/**
 * X5: bölgenin biçimine göre kesim modu önerir. Kesit geniş ve çıkıntı
 * kesitine göre uzunsa (kulak, kol, kafa) Keys; yüzeysel/sığ bölgelerde
 * (göz, kaş, burun) Socket. Hacim, bölge + düz kapaktan hesaplanır (boolean yok).
 */
export function suggestCutMode(mesh: LabeledMesh, slot: number): CutSuggestion | null {
  let islands: Island[];
  try {
    islands = findIslands(mesh, slot);
  } catch {
    return null;
  }
  // en büyük ada belirleyici
  let best: { island: Island; area: number; volume: number } | null = null;
  for (const island of islands) {
    const idx: number[] = [];
    for (const t of island.tris)
      idx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
    let capArea = 0;
    try {
      for (const loop of island.loops) {
        const cap = triangulateLoop(mesh.positions, loop);
        idx.push(...cap);
        capArea += loopPlane(mesh.positions, loop).area;
      }
    } catch {
      continue;
    }
    const volume = Math.abs(
      signedVolume({ positions: mesh.positions, indices: Uint32Array.from(idx) }),
    );
    if (!best || capArea > best.area) best = { island, area: capArea, volume };
  }
  if (!best || best.area <= 0) return null;
  const capRadius = Math.sqrt(best.area / Math.PI);
  const height = best.volume / best.area;
  const keys = capRadius >= 4 && height >= capRadius * 0.8;
  return {
    mode: keys ? 'keys' : 'socket',
    capRadius,
    height,
    reason: keys
      ? `kalın çıkıntı (kesit ~${(2 * capRadius).toFixed(0)} mm, boy ~${height.toFixed(0)} mm): düz kesim + pim`
      : `yüzeysel bölge (kesit ~${(2 * capRadius).toFixed(0)} mm, yükseklik ~${height.toFixed(1)} mm): tapa + yuva`,
  };
}
