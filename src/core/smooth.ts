import { EDGE_SMOOTH_MULTIPLES, type EdgeSmoothing } from './cutTypes';
import { faceCentroids, faceNormalsAndAreas } from './geometry';
import { cleanSelection } from './paint';
import { boundaryLoops, buildAdjacency } from './topology';
import { BASE_SLOT, type LabeledMesh } from './types';

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
 *
 * `exact` (X30): 3. adım yerine sınır üçgenlerin içinden geçirilir: eğriye
 * işaretli uzaklık köşe alanı olarak hesaplanır ve sıfır çizgisinin kestiği
 * üçgenler bölünür. Köşeler yerinde kalır (şekil değişmez), sınır üçgen
 * boyutundan bağımsız olarak eğriyi izler. Mesh'e yeni köşe ve üçgen eklenir.
 */
export function smoothRegionBoundary(
  mesh: LabeledMesh,
  adj: Int32Array,
  slot: number,
  radius: number,
  accept: (t: number) => boolean,
  outsideLabel: (t: number) => number,
  exact = false,
  /** `exact` iken bölmenin farkı (yerinde uygulayıp farkla geri almak için). */
  onSplit?: (diff: SplitDiff) => void,
): LabeledMesh {
  const labels = Uint16Array.from(mesh.labels);
  const positions = new Float32Array(mesh.positions);
  const triCount = labels.length;
  const mask = Uint8Array.from(labels, (l) => (l === slot ? 1 : 0));
  const loops = boundaryLoops(mesh, adj, mask).filter((l) => l.length >= 6);
  if (!loops.length) return { labels, positions, indices: mesh.indices };

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
    if (
      c[0] < lo[0] ||
      c[1] < lo[1] ||
      c[2] < lo[2] ||
      c[0] > hi[0] ||
      c[1] > hi[1] ||
      c[2] > hi[2]
    )
      continue;
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
  for (let it = 0; it < 3; it++)
    offset += (areaBefore - areaWith(offset)) / Math.max(perimeter, 1e-6);
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
  const cleaned = cleanSelection(adj, areas, newMask, {
    minArea: 1,
    accept: (t) => labels[t] === slot || accept(t),
  });
  for (let t = 0; t < triCount; t++) {
    if (cleaned[t] && labels[t] !== slot) labels[t] = slot;
    else if (!cleaned[t] && labels[t] === slot) labels[t] = outsideLabel(t);
  }

  if (exact) {
    // üçgen içinden geçen sınırda alan, üçgen merkezli tahminden biraz farklı: offset iki adımda düzeltilir
    let diff = cutAlongCurves(mesh, labels, slot, index, band, offset, accept, outsideLabel);
    let out = applySplit(mesh, diff);
    for (let it = 0; it < 2; it++) {
      const { areas: ar } = faceNormalsAndAreas(out);
      let area = 0;
      for (let t = 0; t < out.labels.length; t++) if (out.labels[t] === slot) area += ar[t];
      const step = (areaBefore - area) / Math.max(perimeter, 1e-6);
      if (Math.abs(step) < 1e-3) break;
      offset = Math.max(-radius, Math.min(radius, offset + step));
      diff = cutAlongCurves(mesh, labels, slot, index, band, offset, accept, outsideLabel);
      out = applySplit(mesh, diff);
    }
    onSplit?.(diff);
    return out;
  }

  // 3. yeni sınır köşelerini eğriye çek
  snapBoundaryToCurves(
    { positions, indices: mesh.indices, labels },
    adj,
    slot,
    index,
    band,
    offset,
  );
  return { labels, positions, indices: mesh.indices };
}

/**
 * X53: kesimden hemen önce seçili slotun sınırını üçgenlerin içinden geçirir.
 * Girdi değişmez. Bölgeye yalnız taban katılır; çıkan üçgen komşudaki çoğunluk
 * etiketini alır. Yarıçap ortalama kenarın 4 katıdır.
 */
export function smoothCutEdge(
  mesh: LabeledMesh,
  slot: number,
  strength: EdgeSmoothing = 'medium',
): LabeledMesh {
  if (slot === BASE_SLOT || !mesh.labels.includes(slot)) return mesh;
  const adj = buildAdjacency(mesh);
  const labels = mesh.labels;
  return smoothRegionBoundary(
    mesh,
    adj,
    slot,
    meanEdgeLength(mesh) * EDGE_SMOOTH_MULTIPLES[strength],
    (t) => labels[t] === BASE_SLOT,
    (t) => majorityOtherLabel(adj, labels, t, slot),
    true,
  );
}

function meanEdgeLength(mesh: LabeledMesh): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < idx.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[i + k];
      const b = idx[i + ((k + 1) % 3)];
      const dx = p[3 * a] - p[3 * b];
      const dy = p[3 * a + 1] - p[3 * b + 1];
      const dz = p[3 * a + 2] - p[3 * b + 2];
      sum += Math.hypot(dx, dy, dz);
      n++;
    }
  }
  return n ? sum / n : 1;
}

function majorityOtherLabel(
  adj: Int32Array,
  labels: Uint16Array,
  t: number,
  exclude: number,
): number {
  const counts = new Map<number, number>();
  for (let e = 0; e < 3; e++) {
    const n = adj[3 * t + e];
    if (n < 0 || labels[n] === exclude) continue;
    counts.set(labels[n], (counts.get(labels[n]) ?? 0) + 1);
  }
  let best = BASE_SLOT;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

/**
 * X30: eğriye (offset kadar dışına) işaretli uzaklığı köşelerde hesaplar ve
 * mesh'i bu alanın sıfır çizgisi boyunca böler. `labels`: yaklaşık etiketleme
 * (bandın dışındaki üçgenler bunu korur).
 */
function cutAlongCurves(
  mesh: LabeledMesh,
  labels: Uint16Array,
  slot: number,
  index: SegmentIndex,
  band: number,
  offset: number,
  accept: (t: number) => boolean,
  outsideLabel: (t: number) => number,
): SplitDiff {
  const { positions: pos, indices: idx } = mesh;
  const vCount = pos.length / 3;
  const triCount = labels.length;
  // alan ağırlıklı köşe normalleri
  const vn = new Float32Array(3 * vCount);
  for (let t = 0; t < triCount; t++) {
    const a = idx[3 * t];
    const b = idx[3 * t + 1];
    const c = idx[3 * t + 2];
    const u: V3 = [
      pos[3 * b] - pos[3 * a],
      pos[3 * b + 1] - pos[3 * a + 1],
      pos[3 * b + 2] - pos[3 * a + 2],
    ];
    const w: V3 = [
      pos[3 * c] - pos[3 * a],
      pos[3 * c + 1] - pos[3 * a + 1],
      pos[3 * c + 2] - pos[3 * a + 2],
    ];
    const n = cross(u, w);
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) vn[3 * v + k] += n[k];
  }
  const phi = new Float64Array(vCount);
  const inBand = new Uint8Array(vCount);
  for (let v = 0; v < vCount; v++) {
    const p: V3 = [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
    const hit = index.closest(p, band);
    if (!hit) continue;
    const nl = Math.hypot(vn[3 * v], vn[3 * v + 1], vn[3 * v + 2]) || 1;
    const n: V3 = [vn[3 * v] / nl, vn[3 * v + 1] / nl, vn[3 * v + 2] / nl];
    phi[v] = dot(sub(p, hit.point), cross(n, hit.tangent)) + offset;
    inBand[v] = 1;
  }
  return splitAlongField(mesh, labels, phi, inBand, slot, accept, outsideLabel);
}

/**
 * Sıfır seviye çizgisi boyunca bölmenin sonucu, yerinde uygulanabilir fark
 * olarak: eski köşeler ve üçgen numaraları korunur (bölünen üçgenin ilk
 * parçası kendi yerinde kalır, diğer parçalar sona eklenir). Geri alma bu
 * farkla yapılır; mesh'in tam kopyası saklanmaz.
 */
export interface SplitDiff {
  baseVerts: number;
  baseTris: number;
  /** Sona eklenen köşeler. */
  addedPositions: Float32Array;
  /** Yeri değişen (bölünen ya da etiketi değişen) eski üçgenler, eski ve yeni halleri. */
  changedTris: Uint32Array;
  oldIndices: Uint32Array;
  oldLabels: Uint16Array;
  newIndices: Uint32Array;
  newLabels: Uint16Array;
  /** Sona eklenen üçgenler. */
  addedIndices: Uint32Array;
  addedLabels: Uint16Array;
}

/** Farkı uygular, yeni dizilerle mesh döndürür (girdi değişmez). */
export function applySplit(mesh: LabeledMesh, d: SplitDiff): LabeledMesh {
  const positions = new Float32Array(mesh.positions.length + d.addedPositions.length);
  positions.set(mesh.positions);
  positions.set(d.addedPositions, mesh.positions.length);
  const indices = new Uint32Array(mesh.indices.length + d.addedIndices.length);
  indices.set(mesh.indices);
  indices.set(d.addedIndices, mesh.indices.length);
  const labels = new Uint16Array(mesh.labels.length + d.addedLabels.length);
  labels.set(mesh.labels);
  labels.set(d.addedLabels, mesh.labels.length);
  d.changedTris.forEach((t, i) => {
    indices.set(d.newIndices.subarray(3 * i, 3 * i + 3), 3 * t);
    labels[t] = d.newLabels[i];
  });
  return { positions, indices, labels };
}

/** Farkı geri alır: eklenenler atılır, değişen üçgenler eski haline döner. */
export function revertSplit(mesh: LabeledMesh, d: SplitDiff): LabeledMesh {
  const positions = mesh.positions.slice(0, 3 * d.baseVerts);
  const indices = mesh.indices.slice(0, 3 * d.baseTris);
  const labels = mesh.labels.slice(0, d.baseTris);
  d.changedTris.forEach((t, i) => {
    indices.set(d.oldIndices.subarray(3 * i, 3 * i + 3), 3 * t);
    labels[t] = d.oldLabels[i];
  });
  return { positions, indices, labels };
}

/**
 * X30/X34: köşe alanı `phi`nin (bölge içi +) sıfır çizgisi boyunca böler.
 * `active` köşelerde alan geçerlidir; diğerleri `labels`e göre + (içeride),
 * − (dışarıda) ya da 0 (sınırda) alır. Etkin köşeye değen üçgen işaretine göre
 * etiketlenir (başlangıç etiketi `mesh.labels`e göre), diğerleri `labels`i
 * korur.
 */
export function splitAlongField(
  mesh: LabeledMesh,
  labels: Uint16Array,
  phiIn: Float64Array,
  active: Uint8Array,
  slot: number,
  accept: (t: number) => boolean,
  outsideLabel: (t: number) => number,
): SplitDiff {
  const { positions: pos, indices: idx } = mesh;
  const vCount = pos.length / 3;
  const triCount = labels.length;
  const phi = Float64Array.from(phiIn);
  // etkin olmayan köşe: üçgenlerinin hepsi bölgedeyse +, hiçbiri değilse −, sınırdaysa 0.
  // Böylece etkin alanın dışında sıfır çizgisi mevcut sınırdan geçer, orada bölme olmaz.
  const inCount = new Int32Array(vCount);
  const outCount = new Int32Array(vCount);
  for (let t = 0; t < triCount; t++) {
    const c = labels[t] === slot ? inCount : outCount;
    for (let k = 0; k < 3; k++) c[idx[3 * t + k]]++;
  }
  // büyüklük: etkin köşelerdeki en büyük |phi| (kenar kesişimi makul yerde kalsın)
  let big = 1e-6;
  for (let v = 0; v < vCount; v++) if (active[v]) big = Math.max(big, Math.abs(phi[v]));
  for (let v = 0; v < vCount; v++)
    if (!active[v]) phi[v] = inCount[v] && outCount[v] ? 0 : inCount[v] ? big : -big;

  // sıfır çizgisi bir köşeye çok yakın geçiyorsa köşeden geçsin: ince şerit üçgen oluşmaz
  const EPS = 0.12;
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const a = idx[3 * t + e];
      const b = idx[3 * t + ((e + 1) % 3)];
      if (!(active[a] || active[b]) || phi[a] * phi[b] >= 0) continue;
      const s = phi[a] / (phi[a] - phi[b]);
      if (s < EPS) phi[a] = 0;
      else if (s > 1 - EPS) phi[b] = 0;
    }
  }

  const addedPos: number[] = [];
  const crossing = new Map<number, number>();
  const P = (v: number, k: number) =>
    v < vCount ? pos[3 * v + k] : addedPos[3 * (v - vCount) + k];
  const crossAt = (a: number, b: number): number => {
    const key = a < b ? a * vCount + b : b * vCount + a;
    let v = crossing.get(key);
    if (v === undefined) {
      const s = phi[a] / (phi[a] - phi[b]);
      v = vCount + addedPos.length / 3;
      for (let k = 0; k < 3; k++)
        addedPos.push(pos[3 * a + k] + (pos[3 * b + k] - pos[3 * a + k]) * s);
      crossing.set(key, v);
    }
    return v;
  };
  // etkin bölgede etiket eğriden okunur (başlangıç etiketine göre); başka slotun üçgeni bölgeye girmez
  const sideLabel = (t: number, inside: boolean) => {
    const was = mesh.labels[t];
    if (inside) return was === slot || accept(t) ? slot : was;
    return was === slot ? outsideLabel(t) : was;
  };
  const changed: number[] = [];
  const newIdx: number[] = [];
  const newLab: number[] = [];
  const addIdx: number[] = [];
  const addLab: number[] = [];
  const triangulate = (poly: number[]): number[][] => {
    if (poly.length === 4) {
      // dörtgen: kısa köşegenden böl
      const d = (i: number, j: number) =>
        Math.hypot(
          P(poly[i], 0) - P(poly[j], 0),
          P(poly[i], 1) - P(poly[j], 1),
          P(poly[i], 2) - P(poly[j], 2),
        );
      if (d(1, 3) < d(0, 2)) poly = [poly[1], poly[2], poly[3], poly[0]];
    }
    const out: number[][] = [];
    for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0], poly[i], poly[i + 1]]);
    return out;
  };
  for (let t = 0; t < triCount; t++) {
    // etkin köşeye değmeyen üçgen: sadece yaklaşık etiket değişikliği (dizi ayırmadan, büyük mesh'te hızlı)
    if (!(active[idx[3 * t]] || active[idx[3 * t + 1]] || active[idx[3 * t + 2]])) {
      if (labels[t] !== mesh.labels[t]) {
        changed.push(t);
        newIdx.push(idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]);
        newLab.push(labels[t]);
      }
      continue;
    }
    const v = [idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]];
    const touched = true;
    const sg = v.map((x) => Math.sign(phi[x]));
    const hasPos = sg.includes(1);
    const hasNeg = sg.includes(-1);
    if (!touched || !(hasPos && hasNeg)) {
      // bölünmez; etkin bölgede işarete göre, üç köşesi de sıfırsa eski etiket
      const label = touched && (hasPos || hasNeg) ? sideLabel(t, hasPos) : labels[t];
      if (label !== mesh.labels[t]) {
        changed.push(t);
        newIdx.push(v[0], v[1], v[2]);
        newLab.push(label);
      }
      continue;
    }
    // üçgeni kenar kesişimleriyle dolaş, iki tarafa ayır (sıfır köşe iki tarafta da)
    const plus: number[] = [];
    const minus: number[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (sg[i] >= 0) plus.push(v[i]);
      if (sg[i] <= 0) minus.push(v[i]);
      if (sg[i] * sg[j] < 0) {
        const x = crossAt(v[i], v[j]);
        plus.push(x);
        minus.push(x);
      }
    }
    const pieces = [
      ...triangulate(plus).map((tri) => ({ tri, label: sideLabel(t, true) })),
      ...triangulate(minus).map((tri) => ({ tri, label: sideLabel(t, false) })),
    ];
    // ilk parça üçgenin kendi yerinde kalır
    changed.push(t);
    newIdx.push(...pieces[0].tri);
    newLab.push(pieces[0].label);
    for (const p of pieces.slice(1)) {
      addIdx.push(...p.tri);
      addLab.push(p.label);
    }
  }
  const changedTris = Uint32Array.from(changed);
  const oldIndices = new Uint32Array(changed.length * 3);
  changed.forEach((t, i) => {
    oldIndices.set(idx.subarray(3 * t, 3 * t + 3), 3 * i);
  });
  return {
    baseVerts: vCount,
    baseTris: triCount,
    addedPositions: Float32Array.from(addedPos),
    changedTris,
    oldIndices,
    oldLabels: Uint16Array.from(changed, (t) => mesh.labels[t]),
    newIndices: Uint32Array.from(newIdx),
    newLabels: Uint16Array.from(newLab),
    addedIndices: Uint32Array.from(addIdx),
    addedLabels: Uint16Array.from(addLab),
  };
}

/**
 * Fırça alanı: `dist2(v)` (fırça merkezine/izine uzaklığın karesi) ile
 * `radius` içindeki bölge sınırına işaretli uzaklık, 2G − G∘G ile
 * yumuşatılmış hali (`phiN`) ve yerel komşuluk. Sınır yoksa null.
 */
function smoothField(
  mesh: LabeledMesh,
  slot: number,
  dist2: (v: number) => number,
  radius: number,
  strength: number,
  candidates?: ArrayLike<number>,
) {
  const { labels, positions: pos, indices: idx } = mesh;
  const triCount = labels.length;
  const vCount = pos.length / 3;
  const reach2 = (radius * 1.5) ** 2;
  // fırça altındaki üçgenler ve köşeler (yerel numaralı); aday listesi verilirse sadece onlara bakılır
  const near: number[] = [];
  if (candidates) {
    for (let i = 0; i < candidates.length; i++)
      if (dist2(idx[3 * candidates[i]]) <= reach2) near.push(candidates[i]);
    // tam taramayla aynı sıra: köşeler sırayla kaydırıldığından sonuç sıraya bağlı
    near.sort((x, y) => x - y);
  } else {
    for (let t = 0; t < triCount; t++) if (dist2(idx[3 * t]) <= reach2) near.push(t);
  }
  if (!near.length) return null;
  const local = new Map<number, number>();
  const verts: number[] = [];
  for (const t of near) {
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      if (!local.has(v)) {
        local.set(v, verts.length);
        verts.push(v);
      }
    }
  }
  const n = verts.length;
  const { start, list } = vertexTriangles(idx, vCount);
  // köşe tarafı: tüm üçgenleri bölgedeyse +1, hiçbiri değilse -1, karışıksa sınır (0)
  const side = new Int8Array(n);
  let anyBoundary = false;
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    let inS = 0;
    let out = 0;
    for (let j = start[v]; j < start[v + 1]; j++) labels[list[j]] === slot ? inS++ : out++;
    side[i] = inS && out ? 0 : inS ? 1 : -1;
    if (side[i] === 0 && dist2(v) <= radius * radius) anyBoundary = true;
  }
  if (!anyBoundary) return null;
  // yerel komşuluk (fırça üçgenlerinin kenarları)
  const nbr: number[][] = Array.from({ length: n }, () => []);
  for (const t of near) {
    for (let k = 0; k < 3; k++) {
      const a = local.get(idx[3 * t + k]) as number;
      const b = local.get(idx[3 * t + ((k + 1) % 3)]) as number;
      nbr[a].push(b);
      nbr[b].push(a);
    }
  }
  const P = (i: number): V3 => [pos[3 * verts[i]], pos[3 * verts[i] + 1], pos[3 * verts[i] + 2]];
  const len = (i: number, j: number) => {
    const a = P(i);
    const b = P(j);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  // işaretli uzaklık: sınır köşelerinden Dijkstra (küçük kümede basit kuyrukla)
  const phi = new Float64Array(n).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (side[i] === 0) {
      phi[i] = 0;
      queue.push(i);
    }
  }
  let edgeSum = 0;
  let edgeCount = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    for (const j of nbr[i]) {
      const d = len(i, j);
      edgeSum += d;
      edgeCount++;
      if (phi[i] + d < phi[j]) {
        phi[j] = phi[i] + d;
        queue.push(j);
      }
    }
  }
  const meanEdge = edgeCount ? edgeSum / edgeCount : radius / 5;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(phi[i])) phi[i] = radius;
    if (side[i] < 0) phi[i] = -phi[i];
  }
  // Gauss: komşu ortalaması, (σ / kenar)² adım
  const sigma = radius * 0.5;
  const steps = Math.min(80, Math.max(1, Math.round((sigma / meanEdge) ** 2)));
  const blur = (src: Float64Array) => {
    let cur = src.slice();
    let next = new Float64Array(n);
    for (let it = 0; it < steps; it++) {
      for (let i = 0; i < n; i++) {
        let sum = cur[i];
        for (const j of nbr[i]) sum += cur[j];
        next[i] = sum / (1 + nbr[i].length);
      }
      [cur, next] = [next, cur];
    }
    return cur;
  };
  const g = blur(phi);
  const gg = blur(g);
  const k = Math.min(1, strength);
  const w = (i: number) => {
    const d = Math.sqrt(dist2(verts[i]));
    if (d >= radius) return 0;
    const x = 1 - d / radius;
    return x * x * (3 - 2 * x);
  };
  const phiN = new Float64Array(n);
  for (let i = 0; i < n; i++) phiN[i] = phi[i] + k * w(i) * (2 * g[i] - gg[i] - phi[i]);
  return { verts, local, nbr, near, phi, phiN, w, start, list, P, n };
}

/**
 * Yumuşatma fırçası: `center` etrafında `radius` içindeki bölge sınırını
 * yerinde düzleştirir. Mesh'in `labels` ve `positions` dizilerini değiştirir,
 * etkilenen üçgenleri döndürür.
 *
 * Seviye kümesi yaklaşımı: fırça altındaki köşelere sınıra işaretli uzaklık
 * (içeride +) verilir, bu alan yüzey üzerinde 2G − G∘G süzgeciyle
 * yumuşatılır (G: Gauss; bu süzgeç bölgeyi büzmez, sadece küçük
 * girinti/çıkıntıları siler). Yeni sınır alanın sıfır çizgisidir: üçgenler
 * işaretine göre etiketlenir, sınır köşeleri sıfır çizgisine kaydırılır.
 * Etki fırça merkezinden kenara doğru azalır.
 */
export function smoothBoundaryAt(
  mesh: LabeledMesh,
  slot: number,
  center: V3,
  radius: number,
  strength: number,
  accept: (t: number) => boolean,
  outsideLabel: (t: number) => number,
  /**
   * X42: fırça altındaki aday üçgenler (ör. vurulan üçgenden yüzey üzerinde
   * yayılarak bulunanlar). Verilmezse tüm üçgenler taranır; 1.9M üçgende
   * bu darbe başına ~15 ms.
   */
  candidates?: ArrayLike<number>,
): number[] {
  const { labels, positions: pos, indices: idx } = mesh;
  const dist2 = (v: number) =>
    (pos[3 * v] - center[0]) ** 2 +
    (pos[3 * v + 1] - center[1]) ** 2 +
    (pos[3 * v + 2] - center[2]) ** 2;
  const field = smoothField(mesh, slot, dist2, radius, strength, candidates);
  if (!field) return [];
  const { verts, local, nbr, near, phiN, w, start, list, P, n } = field;

  // yeniden etiketleme: fırça içindeki üçgenler sıfır çizgisinin hangi tarafında
  const changed = new Set<number>();
  for (const t of near) {
    const a = local.get(idx[3 * t]) as number;
    const b = local.get(idx[3 * t + 1]) as number;
    const c = local.get(idx[3 * t + 2]) as number;
    if (w(a) + w(b) + w(c) === 0) continue;
    const inside = phiN[a] + phiN[b] + phiN[c] > 0;
    if (inside && labels[t] !== slot && accept(t)) {
      labels[t] = slot;
      changed.add(t);
    } else if (!inside && labels[t] === slot) {
      labels[t] = outsideLabel(t);
      changed.add(t);
    }
  }
  // sınır köşelerini sıfır çizgisine kaydır (alanın eğimi boyunca, teğet düzlemde)
  const triNormal = (t: number): V3 => {
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    return cross(
      [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]],
      [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]],
    );
  };
  for (let i = 0; i < n; i++) {
    if (w(i) === 0) continue;
    const v = verts[i];
    let inS = 0;
    let out = 0;
    const seen = new Set<number>();
    for (let j = start[v]; j < start[v + 1]; j++) {
      const l = labels[list[j]];
      seen.add(l);
      l === slot ? inS++ : out++;
    }
    if (!inS || !out || seen.size > 2) continue;
    // eğim: komşulara göre en küçük kareler
    const p = P(i);
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let norm = 0;
    let minEdge = Infinity;
    for (const j of nbr[i]) {
      const q = P(j);
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const dz = q[2] - p[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      // üst üste köşe: eğime katkısı yok (0/0 NaN üretirdi)
      if (d2 < 1e-12) continue;
      const df = phiN[j] - phiN[i];
      gx += (df * dx) / d2;
      gy += (df * dy) / d2;
      gz += (df * dz) / d2;
      norm++;
      minEdge = Math.min(minEdge, Math.sqrt(d2));
    }
    if (!norm) continue;
    const before: V3[] = [];
    let nv: V3 = [0, 0, 0];
    for (let j = start[v]; j < start[v + 1]; j++) {
      const tn = triNormal(list[j]);
      before.push(tn);
      nv = [nv[0] + tn[0], nv[1] + tn[1], nv[2] + tn[2]];
    }
    const nl = Math.hypot(...nv) || 1;
    nv = [nv[0] / nl, nv[1] / nl, nv[2] / nl];
    let grad: V3 = [gx / norm, gy / norm, gz / norm];
    const gn = dot(grad, nv);
    grad = [grad[0] - gn * nv[0], grad[1] - gn * nv[1], grad[2] - gn * nv[2]];
    const g2 = dot(grad, grad);
    if (g2 < 1e-12) continue;
    // köşeyi, alanın sıfır olduğu noktaya doğru taşı
    let d: V3 = [(-phiN[i] * grad[0]) / g2, (-phiN[i] * grad[1]) / g2, (-phiN[i] * grad[2]) / g2];
    const dl = Math.hypot(...d);
    if (!Number.isFinite(dl)) continue;
    // küçük fırçada uzun kenarlı köşe fırçanın çok dışına kaçmasın (üst üste darbelerde üçgen uzayıp diken olurdu)
    const maxMove = Math.min(0.45 * minEdge, 0.25 * radius);
    if (dl > maxMove) d = [(d[0] * maxMove) / dl, (d[1] * maxMove) / dl, (d[2] * maxMove) / dl];
    pos[3 * v] = p[0] + d[0];
    pos[3 * v + 1] = p[1] + d[1];
    pos[3 * v + 2] = p[2] + d[2];
    let ok = true;
    let m = 0;
    for (let j = start[v]; j < start[v + 1] && ok; j++, m++) {
      const b0 = before[m];
      const b1 = triNormal(list[j]);
      const l0 = Math.hypot(...b0);
      const l1 = Math.hypot(...b1);
      if (l1 < l0 * 0.3 || dot(b0, b1) / (l0 * l1 || 1) < 0.9) ok = false;
    }
    if (!ok) {
      pos[3 * v] = p[0];
      pos[3 * v + 1] = p[1];
      pos[3 * v + 2] = p[2];
      continue;
    }
    for (let j = start[v]; j < start[v + 1]; j++) changed.add(list[j]);
  }
  return [...changed];
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
const vertexTriCache = new WeakMap<Uint32Array, { start: Uint32Array; list: Uint32Array }>();

/** Köşe -> üçgenler (CSR). İndeks dizisi başına önbellekli (fırça darbeleri boyunca değişmez). */
function vertexTriangles(
  idx: Uint32Array,
  vCount: number,
): { start: Uint32Array; list: Uint32Array } {
  let c = vertexTriCache.get(idx);
  if (!c || c.start.length !== vCount + 1) {
    const start = new Uint32Array(vCount + 1);
    for (let i = 0; i < idx.length; i++) start[idx[i] + 1]++;
    for (let v = 0; v < vCount; v++) start[v + 1] += start[v];
    const fill = start.slice(0, vCount);
    const list = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) list[fill[idx[i]]++] = Math.floor(i / 3);
    c = { start, list };
    vertexTriCache.set(idx, c);
  }
  return c;
}

/**
 * Bölge sınırındaki köşeleri eğrinin en yakın noktasına doğru, teğet
 * düzlemde ve üçgenleri ters çevirmeden kaydırır. `tris` verilirse sadece
 * o üçgenlerin köşelerine bakılır (fırça). Kaydırılan köşeleri döndürür.
 */
function snapBoundaryToCurves(
  mesh: LabeledMesh,
  adj: Int32Array,
  slot: number,
  index: SegmentIndex,
  band: number,
  offset: number,
  opts: { tris?: ArrayLike<number>; iterations?: number } = {},
): number[] {
  const { indices: idx, labels } = mesh;
  const pos = mesh.positions;
  const vCount = pos.length / 3;
  const triCount = labels.length;
  const onBoundary = new Set<number>();
  const scan = (t: number) => {
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n < 0 || (labels[t] === slot) === (labels[n] === slot)) continue;
      onBoundary.add(idx[3 * t + e]);
      onBoundary.add(idx[3 * t + ((e + 1) % 3)]);
    }
  };
  if (opts.tris) for (let i = 0; i < opts.tris.length; i++) scan(opts.tris[i]);
  else for (let t = 0; t < triCount; t++) scan(t);
  const { start, list } = vertexTriangles(idx, vCount);
  const verts: number[] = [];
  for (const v of onBoundary) {
    const seen = new Set<number>();
    for (let i = start[v]; i < start[v + 1]; i++) seen.add(labels[list[i]]);
    // üç bölgenin buluştuğu köşe sabit kalır
    if (seen.size <= 2) verts.push(v);
  }
  const moved = new Set<number>();
  const triNormal = (t: number): V3 => {
    const a = 3 * idx[3 * t];
    const b = 3 * idx[3 * t + 1];
    const c = 3 * idx[3 * t + 2];
    const u: V3 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const w: V3 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    return cross(u, w);
  };
  for (let it = 0; it < (opts.iterations ?? 10); it++) {
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
          if (w !== v)
            minEdge = Math.min(
              minEdge,
              Math.hypot(pos[3 * w] - p[0], pos[3 * w + 1] - p[1], pos[3 * w + 2] - p[2]),
            );
        }
      }
      const nl = Math.hypot(...n) || 1;
      n = [n[0] / nl, n[1] / nl, n[2] / nl];
      // hedef: eğrinin offset kadar dışı (bölge solda: dış = -sol)
      const left = cross(n, hit.tangent);
      const target: V3 = [
        hit.point[0] - offset * left[0],
        hit.point[1] - offset * left[1],
        hit.point[2] - offset * left[2],
      ];
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
      } else if (d[0] || d[1] || d[2]) {
        moved.add(v);
      }
    }
  }
  return [...moved];
}

/**
 * X34: yumuşatma fırçası darbesi bitince, darbenin geçtiği yerde sınır
 * üçgenlerin içinden geçirilir. Fırçadaki alan (sınıra işaretli uzaklık,
 * 2G − G∘G ile yumuşatılmış) darbe izinin tamamı için bir kez daha
 * hesaplanır ve sıfır çizgisi boyunca bölünür. Fırçanın kenarında alan
 * yumuşatılmamış uzaklığa iner; orada sıfır çizgisi mevcut sınırdan geçer,
 * geçiş dikişsizdir. Bölge yoksa null.
 */
export function smoothStrokeSplit(
  mesh: LabeledMesh,
  slot: number,
  path: V3[],
  radius: number,
  strength: number,
  accept: (t: number) => boolean,
  outsideLabel: (t: number) => number,
): SplitDiff | null {
  if (!path.length) return null;
  // iz noktalarını r/3 aralıkla seyrelt
  const centers: V3[] = [path[0]];
  for (const p of path) {
    const q = centers[centers.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) >= radius / 3) centers.push(p);
  }
  const reach = radius * 1.5;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const c of centers) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], c[k] - reach);
      hi[k] = Math.max(hi[k], c[k] + reach);
    }
  }
  const pos = mesh.positions;
  const far = reach * reach * 4;
  const dist2 = (v: number) => {
    const x = pos[3 * v];
    const y = pos[3 * v + 1];
    const z = pos[3 * v + 2];
    if (x < lo[0] || y < lo[1] || z < lo[2] || x > hi[0] || y > hi[1] || z > hi[2]) return far;
    let best = far;
    for (const c of centers)
      best = Math.min(best, (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2);
    return best;
  };
  const field = smoothField(mesh, slot, dist2, radius, strength);
  if (!field) return null;
  const vCount = pos.length / 3;
  const phi = new Float64Array(vCount);
  const active = new Uint8Array(vCount);
  for (let i = 0; i < field.n; i++) {
    phi[field.verts[i]] = field.phiN[i];
    active[field.verts[i]] = 1;
  }
  return splitAlongField(mesh, mesh.labels, phi, active, slot, accept, outsideLabel);
}
