import type { Manifold } from 'manifold-3d';
import { capSplit } from './cutCap';
import { checkPinContainment, makePin, pinCenters, pinDepthClearance, pinFit } from './cutPins';
import { manifoldMesh, withFaceId } from './cutSocket';
import {
  CutError,
  type CutOptions,
  type CutPreview,
  type CutResult,
  type Island,
  modelOf,
} from './cutTypes';
import { CUT_FACE_ID, fromManifoldMapped, KernelError, kernel, Scope, toManifold } from './kernel';
import { regionInsideLoop } from './lasso';
import { meshTopology } from './meshTopology';
import { boundaryLoops } from './topology';
import { BASE_SLOT, type LabeledMesh, type MeshData, type Vec3 } from './types';
import { add, cross, dot, normalize, orthoBasis, scale, sub, vertexAt } from './vec';

/**
 * Halkanın Newell normali, alan merkezi ve izdüşüm alanı. Merkez köşe
 * ortalaması değil çokgenin alan merkezi: sınırın sık örneklendiği tarafa kaymaz.
 */
export function loopPlane(
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

export function planeSplit(
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
        'Bu halkadan düzlemle kesilemiyor. Halkayı bölgenin daha düz yerinden geçir ya da Tapa ile kes.',
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
export function planePatch(positions: Float32Array, island: Island): MeshData {
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
      const placed = pinCenters(mesh, [island], opts.pins, opts.pin, pinFit(opts), warnings);
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
export function seamCut(mesh: LabeledMesh, loop: number[], opts: CutOptions): CutResult {
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
      const placed = pinCenters(mesh, [island], opts.pins, opts.pin, pinFit(opts), warnings);
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

export function seamPreview(mesh: LabeledMesh, loop: number[], opts: CutOptions): CutPreview {
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
  const warnings: string[] = [];
  try {
    const pins =
      opts.mode === 'keys'
        ? pinCenters(mesh, [island], opts.pins, opts.pin, pinFit(opts), warnings).map((p) =>
            manifoldMesh(makePin(p.spec, p.center, p.axis, 0, scope)),
          )
        : [];
    return {
      volumes: [planePatch(mesh.positions, island)],
      pins,
      thin: [],
      ringMarkers: [],
      warnings,
    };
  } finally {
    scope.dispose();
  }
}
