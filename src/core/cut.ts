import type { Manifold } from 'manifold-3d';
import { faceNormalsAndAreas } from './geometry';
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

export interface CutOptions {
  mode: CutMode;
  slot: number;
  /** Socket: tapanın yüzeyden içeri uzandığı derinlik, mm. */
  depth: number;
  /** Tapa/yuva ve pim/yuva arasındaki boşluk, mm. */
  clearance: number;
  /** Socket uzama yönü (dışa doğru). Verilmezse bölge normallerinin ortalaması. */
  direction?: Vec3;
  pin: PinOptions;
  /** Keys: yüzeyde tıklanan pim noktaları. Boşsa her adanın kapak merkezine bir pim. */
  pinPoints?: Vec3[];
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
}

function findIslands(mesh: LabeledMesh, slot: number): Island[] {
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

  return groups.map((tris) => {
    const islandMask = new Uint8Array(triCount);
    let n: Vec3 = [0, 0, 0];
    for (const t of tris) {
      islandMask[t] = 1;
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
    return { tris, loops, normal: normalize(n), capNormal, capCenter, mainLoop };
  });
}

/** Halkanın Newell normali, ağırlık merkezi ve izdüşüm alanı. */
function loopPlane(positions: Float32Array, loop: number[]): { normal: Vec3; center: Vec3; area: number } {
  let n: Vec3 = [0, 0, 0];
  let c: Vec3 = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    const p = vertexAt(positions, loop[i]);
    const q = vertexAt(positions, loop[(i + 1) % loop.length]);
    n = add(n, cross(p, q));
    c = add(c, p);
  }
  return { normal: normalize(n), center: scale(c, 1 / loop.length), area: Math.hypot(...n) / 2 };
}

/**
 * Halkayı kendi düzlemine izdüşürüp üçgenler. Üçgenler kesilen parçanın
 * içinden dışarı (gövdeye doğru) bakacak şekilde döner.
 *
 * İzdüşümde üst üste düşen köşeler (ör. dikey sınır parçaları) önce atılır,
 * düzlemde üçgenlenir, sonra atılan köşeler ait oldukları kenarın üçgenine
 * yelpaze olarak geri eklenir. Böylece halkadaki her köşe kapakta kalır.
 */
function triangulateLoop(positions: Float32Array, loop: number[]): number[] {
  const [u, v] = orthoBasis(loopPlane(positions, loop).normal);
  const pts = loop.map((i) => {
    const p = vertexAt(positions, i);
    return [dot(p, u), dot(p, v)] as [number, number];
  });
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

  const tris = kernel().triangulate([kept.map((i) => pts[i])]);
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
    if (area < 0) [j, k] = [k, j];
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

/** Fast/Keys: bölgeyi sınır halkası boyunca düz kapakla ayırır. */
function capSplit(mesh: LabeledMesh, islands: Island[], slot: number): { body: LabeledMesh; parts: LabeledMesh[] } {
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
      const cap = triangulateLoop(mesh.positions, loop);
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
 * Socket hacmi: bölge yüzeyi `dir` boyunca +eps'ten -depth'e süpürülür.
 * Bölge `dir` yönünde yükseklik alanı olmalı.
 */
function extrudeVolume(mesh: MeshData, island: Island, dir: Vec3, depth: number, eps: number): MeshData {
  const vmap = new Map<number, number>();
  for (const t of island.tris) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[3 * t + k];
      if (!vmap.has(v)) vmap.set(v, vmap.size);
    }
  }
  const n = vmap.size;
  // üst köşeler 0..n-1, alt köşeler n..2n-1
  const positions = new Float32Array(n * 6);
  for (const [v, i] of vmap) {
    const p = vertexAt(mesh.positions, v);
    positions.set(add(p, scale(dir, eps)), 3 * i);
    positions.set(sub(p, scale(dir, depth)), 3 * (i + n));
  }
  const idx: number[] = [];
  for (const t of island.tris) {
    const a = vmap.get(mesh.indices[3 * t]) as number;
    const b = vmap.get(mesh.indices[3 * t + 1]) as number;
    const c = vmap.get(mesh.indices[3 * t + 2]) as number;
    idx.push(a, b, c);
    idx.push(a + n, c + n, b + n);
  }
  for (const loop of island.loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = vmap.get(loop[i]) as number;
      const b = vmap.get(loop[(i + 1) % loop.length]) as number;
      idx.push(b, a, a + n);
      idx.push(b, a + n, b + n);
    }
  }
  return { positions, indices: Uint32Array.from(idx) };
}

/** Yükseklik alanı olmayan bölgeler için yedek: üçgen başına prizma birleşimi. */
function prismUnion(mesh: MeshData, island: Island, dir: Vec3, depth: number, eps: number, scope: Scope): Manifold {
  const { normals } = faceNormalsAndAreas(mesh);
  const prisms: Manifold[] = [];
  for (const t of island.tris) {
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
    prisms.push(scope.keep(toManifold({ positions, indices: Uint32Array.from(idx) }, CUT_FACE_ID)));
  }
  if (!prisms.length) throw new CutError('Bölge seçilen yöne paralel; hacim üretilemedi.');
  return scope.keep(kernel().Manifold.union(prisms));
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
  points: Vec3[] | undefined,
): { island: Island; center: Vec3 }[] {
  const raw: { island: Island; point: Vec3 }[] =
    !points || points.length === 0
      ? islands.map((island) => ({ island, point: island.capCenter }))
      : points.map((p) => {
          let best = islands[0];
          let bestDist = Infinity;
          for (const island of islands) {
            const d = Math.hypot(...sub(p, island.capCenter));
            if (d < bestDist) {
              best = island;
              bestDist = d;
            }
          }
          return { island: best, point: p };
        });
  // nokta, kapak normali boyunca kapak yüzeyine taşınır (kapak düz olmayabilir)
  return raw.map(({ island, point }) => {
    const cap = triangulateLoop(positions, island.mainLoop);
    const n = island.capNormal;
    const onPlane = sub(point, scale(n, dot(sub(point, island.capCenter), n)));
    return { island, center: lineCapIntersection(positions, cap, onPlane, n) ?? onPlane };
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
    return scope.keep(toManifold(extrudeVolume(mesh, island, dir, opts.depth, eps), CUT_FACE_ID));
  }
  warnings.push('Bölge seçilen yönden tam görünmüyor; yavaş yedek yöntem (prizma birleşimi) kullanıldı.');
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
    const islands = findIslands(mesh, opts.slot);
    const volumes: MeshData[] = [];
    const pins: MeshData[] = [];
    if (opts.mode === 'socket') {
      const eps = Math.max(0.5, 4 * opts.clearance);
      for (const island of islands) {
        const dir = socketDirection(island, opts);
        if (isHeightField(mesh, island, dir)) volumes.push(extrudeVolume(mesh, island, dir, opts.depth, eps));
        else volumes.push(manifoldMesh(socketVolume(mesh, island, opts, eps, scope, warnings)));
      }
    } else {
      for (const island of islands) {
        const idx: number[] = [];
        for (const loop of island.loops) idx.push(...triangulateLoop(mesh.positions, loop));
        volumes.push(extractTriangles({ positions: mesh.positions, indices: Uint32Array.from(idx) }, range(idx.length / 3)).mesh);
      }
      if (opts.mode === 'keys') {
        for (const { island, center } of pinCenters(mesh.positions, islands, opts.pinPoints)) {
          pins.push(manifoldMesh(makePin(opts.pin, center, scale(island.capNormal, -1), 0, scope)));
        }
      }
    }
    return { volumes, pins, warnings };
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
    const islands = findIslands(mesh, opts.slot);
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
      for (const { island, center } of pinCenters(mesh.positions, islands, opts.pinPoints)) {
        const i = islands.indexOf(island);
        const axis = scale(island.capNormal, -1); // gövdeye doğru
        const pin = makePin(opts.pin, center, axis, 0, scope);
        const hole = makePin(opts.pin, center, axis, opts.clearance, scope);
        checkPinContainment(pin, parts[i], body, opts.pin, warnings);
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
      parts: parts.map((p) => fromManifold(p, opts.slot)),
      warnings,
    };
  } finally {
    scope.dispose();
  }
}

function checkPinContainment(pin: Manifold, part: Manifold, body: Manifold, opts: PinOptions, warnings: string[]): void {
  const half = pin.volume() / 2;
  const scope = new Scope();
  try {
    const inPart = scope.keep(pin.intersect(part)).volume();
    const inBody = scope.keep(pin.intersect(body)).volume();
    // pim modelin dışına taşıyorsa duvar incedir; bir tarafta çok az kalıyorsa tutmaz
    if (inPart + inBody < 0.98 * 2 * half) {
      warnings.push(
        `Pim modelin dışına taşıyor (%${Math.round((50 * (inPart + inBody)) / half)} içeride). Duvar ince olabilir; pimi küçültün veya yerini değiştirin.`,
      );
    } else if (inPart < 0.5 * half || inBody < 0.5 * half) {
      warnings.push(
        `Pim kesim yüzeyine ortalanmamış (parçada %${Math.round((50 * inPart) / half)}, gövdede %${Math.round((50 * inBody) / half)}).`,
      );
    }
    if (opts.radius <= 0 || opts.length <= 0) warnings.push('Pim boyutu geçersiz.');
  } finally {
    scope.dispose();
  }
}

function socketCut(mesh: LabeledMesh, islands: Island[], opts: CutOptions, scope: Scope, warnings: string[]): CutResult {
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
    parts.push(fromManifold(part, opts.slot));
    holes.push(growVolume(vol, socketDirection(island, opts), opts.clearance, scope));
  }
  if (!parts.length) throw new CutError('Hiç tapa üretilemedi.');
  const allHoles = holes.length === 1 ? holes[0] : scope.keep(kernel().Manifold.union(holes));
  const body = scope.keep(model.subtract(allHoles));
  return { body: fromManifold(body, BASE_SLOT), parts, warnings };
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
