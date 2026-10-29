import { refineCap } from './capRefine';
import { loopPlane } from './cutSeam';
import { CutError, type Island } from './cutTypes';
import { CUT_FACE_ID, kernel } from './kernel';
import { extractTriangles } from './topology';
import type { LabeledMesh, MeshData, Vec3 } from './types';
import { add, dot, orthoBasis, scale, sub, vertexAt } from './vec';

/**
 * Halkayı kendi düzlemine izdüşürüp üçgenler. Üçgenler kesilen parçanın
 * içinden dışarı (gövdeye doğru) bakacak şekilde döner.
 *
 * İzdüşümde üst üste düşen köşeler (ör. dikey sınır parçaları) önce atılır,
 * düzlemde üçgenlenir, sonra atılan köşeler ait oldukları kenarın üçgenine
 * yelpaze olarak geri eklenir. Böylece halkadaki her köşe kapakta kalır.
 */
export function triangulateLoop(positions: Float32Array, loop: number[], normal?: Vec3): number[] {
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
    throw new CutError(
      "Sınır kapak için fazla kıvrık. Kenarı düzelt'i aç, Yumuşat ile kenarı düzelt ya da Düzlemle kes'i dene.",
    );

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
 * X100: halka kapağı, içi sıklaştırılmış (`refineCap`). Yeni köşeler `extra` (xyz)
 * dizisindedir ve `base`ten başlayan numaraları alır; halka köşeleri kendi numarasıyla kalır.
 * Halka tekrarlı köşe taşıyorsa ya da izdüşüm çöküyorsa bugünkü kapak döner.
 */
export function triangulateLoopRefined(
  positions: Float32Array,
  loop: number[],
  normal: Vec3 | undefined,
  base: number,
): { indices: number[]; extra: number[] } {
  const idx = triangulateLoop(positions, loop, normal);
  const local = new Map<number, number>();
  for (let i = 0; i < loop.length; i++) local.set(loop[i], i);
  if (local.size !== loop.length) return { indices: idx, extra: [] };
  const nrm = normal ?? loopPlane(positions, loop).normal;
  const [u, v] = orthoBasis(nrm);
  const xy: number[] = [];
  const h: number[] = [];
  let ring = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = vertexAt(positions, loop[i]);
    xy.push(dot(p, u), dot(p, v));
    h.push(dot(p, nrm));
    const q = vertexAt(positions, loop[(i + 1) % loop.length]);
    ring += Math.hypot(...sub(p, q));
  }
  const tris = idx.map((g) => local.get(g) as number);
  // kapak gövdeye bakar: düzlemde saat yönündeyse sıklaştırma için çevrilir, sonra geri
  let signed = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    signed +=
      (xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) -
      (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1]);
  }
  const flip = signed < 0;
  const oriented = flip ? flipAll(tris) : tris;
  // hedef kenar: halkanın ortalama kenarı, ama kapak boyunca en çok ~40 üçgen (sık mesh'te
  // kapak binlerce üçgene çıkıp boolean'ı yavaşlatmasın)
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < loop.length; i++) {
    x0 = Math.min(x0, xy[2 * i]);
    x1 = Math.max(x1, xy[2 * i]);
    y0 = Math.min(y0, xy[2 * i + 1]);
    y1 = Math.max(y1, xy[2 * i + 1]);
  }
  const target = Math.max(ring / loop.length, Math.hypot(x1 - x0, y1 - y0) / 40);
  const refined = refineCap({ xy, h, tris: oriented }, target);
  if (refined.h.length === loop.length) return { indices: idx, extra: [] };
  const extra: number[] = [];
  for (let i = loop.length; i < refined.h.length; i++) {
    const p = add(
      add(scale(u, refined.xy[2 * i]), scale(v, refined.xy[2 * i + 1])),
      scale(nrm, refined.h[i]),
    );
    extra.push(p[0], p[1], p[2]);
  }
  const out = (flip ? flipAll(refined.tris) : refined.tris).map((l) =>
    l < loop.length ? loop[l] : base + (l - loop.length),
  );
  return { indices: out, extra };
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
export type Projection = ((island: Island) => Vec3) | undefined;

/**
 * `projection`: kapaklar halka düzlemi yerine bu yöne izdüşürülür (bölge
 * normali veya elle verilen yön). Kavisli halkalar kendi düzleminde katlanabiliyor.
 */
/** Kapakla ayrılmış parça: `origin` her üçgenin orijinal üçgen numarası, kapakta CUT_FACE_ID. */
interface SplitMesh extends MeshData {
  origin: Uint32Array;
}

export function capSplit(
  mesh: LabeledMesh,
  islands: Island[],
  projection?: Projection,
): { body: SplitMesh; parts: SplitMesh[] } {
  const triCount = mesh.labels.length;
  const inIsland = new Uint8Array(triCount);
  // X100: kapak içindeki yeni köşeler mesh köşelerinin arkasına eklenir
  const baseCount = mesh.positions.length / 3;
  const extra: number[] = [];
  const bodyIdx: number[] = [];
  const bodyOrigin: number[] = [];
  const parts: { idx: number[]; origin: number[] }[] = [];

  for (const island of islands) {
    for (const t of island.tris) inIsland[t] = 1;
    const partIdx: number[] = [];
    const partOrigin: number[] = [];
    for (const t of island.tris) {
      partIdx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
      partOrigin.push(t);
    }
    for (const loop of island.loops) {
      const { indices: cap, extra: more } = triangulateLoopRefined(
        mesh.positions,
        loop,
        projection?.(island),
        baseCount + extra.length / 3,
      );
      for (const x of more) extra.push(x);
      for (let i = 0; i < cap.length; i += 3) {
        partIdx.push(cap[i], cap[i + 1], cap[i + 2]);
        partOrigin.push(CUT_FACE_ID);
        bodyIdx.push(cap[i], cap[i + 2], cap[i + 1]);
        bodyOrigin.push(CUT_FACE_ID);
      }
    }
    parts.push({ idx: partIdx, origin: partOrigin });
  }
  for (let t = 0; t < triCount; t++) {
    if (inIsland[t]) continue;
    bodyIdx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
    bodyOrigin.push(t);
  }
  let positions = mesh.positions;
  if (extra.length) {
    positions = new Float32Array(mesh.positions.length + extra.length);
    positions.set(mesh.positions);
    positions.set(extra, mesh.positions.length);
  }
  return {
    body: compact(positions, bodyIdx, bodyOrigin),
    parts: parts.map((p) => compact(positions, p.idx, p.origin)),
  };
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
export function extrudePatch(
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
export function ringMarkersFor(
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
export function extrudeVolume(
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
export function capPlugVolumes(
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
    // gövdeye bakan kapak; süpürme için dışa (dir) bakanı gerekir. X100: içi sıklaştırılır,
    // köşeler yerel diziye alınır (büyük mesh'in tamamı kopyalanmaz)
    const base = positions.length / 3;
    const r = triangulateLoopRefined(positions, loop, dir, base);
    const map = new Map<number, number>();
    const local: number[] = [];
    const at = (g: number) => {
      let l = map.get(g);
      if (l === undefined) {
        l = map.size;
        map.set(g, l);
        if (g < base) local.push(positions[3 * g], positions[3 * g + 1], positions[3 * g + 2]);
        else
          local.push(
            r.extra[3 * (g - base)],
            r.extra[3 * (g - base) + 1],
            r.extra[3 * (g - base) + 2],
          );
      }
      return l;
    };
    const cap = flipAll(r.indices.map(at));
    const ring = loop.map(at);
    return {
      mesh: extrudePatch(
        Float32Array.from(local),
        cap,
        [ring],
        dir,
        depth,
        eps,
        squeeze,
        inset,
        ringProfile,
      ),
      dir,
    };
  });
}

export function flipAll(idx: number[]): number[] {
  const out = idx.slice();
  for (let i = 0; i < out.length; i += 3) [out[i + 1], out[i + 2]] = [out[i + 2], out[i + 1]];
  return out;
}
