import type { Manifold } from 'manifold-3d';
import {
  capPlugVolumes,
  capSplit,
  extrudePatch,
  extrudeVolume,
  flipAll,
  type Projection,
} from './cutCap';
import { CutError, type CutOptions, type CutResult, type Island, modelOf } from './cutTypes';
import {
  CUT_FACE_ID,
  fromManifoldMapped,
  KernelError,
  kernel,
  type Scope,
  toManifold,
} from './kernel';
import { meshTopology } from './meshTopology';
import { boundaryLoops } from './topology';
import { BASE_SLOT, type LabeledMesh, type MeshData, type Vec3 } from './types';
import { add, normalize, scale, sub, vertexAt } from './vec';

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

/**
 * X65: yuva payı. Yan yüzler `c` kadar dışarı, en derin taban `c` kadar içeri
 * kayar. Kaydırılmış kopyaların birleşimi, birbirine çok yakın üçgenlerde
 * boolean'ı bitirmiyordu.
 */
export function growVolume(vol: Manifold, dir: Vec3, c: number, scope: Scope): Manifold {
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

export function withFaceId(man: Manifold, id: number, scope: Scope): Manifold {
  const mesh = man.getMesh();
  mesh.faceID = new Uint32Array(mesh.numTri).fill(id);
  return scope.keep(new (kernel().Manifold)(mesh));
}

export function depthOf(island: Island, opts: CutOptions): number {
  return opts.depthByIsland?.[island.key] ?? opts.depth;
}

export function socketDirection(island: Island, opts: CutOptions): Vec3 {
  return opts.direction ? normalize(opts.direction) : island.normal;
}

export function isHeightField(mesh: MeshData, island: Island, dir: Vec3): boolean {
  const { normals, areas } = meshTopology(mesh);
  for (const t of island.tris) {
    if (areas[t] < 1e-9) continue;
    const nd = normals[3 * t] * dir[0] + normals[3 * t + 1] * dir[1] + normals[3 * t + 2] * dir[2];
    if (nd < 0.02) return false;
  }
  return true;
}

export function socketVolume(
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

export function manifoldMesh(man: Manifold): MeshData {
  const m = man.getMesh();
  const positions = new Float32Array(m.numVert * 3);
  for (let i = 0; i < m.numVert; i++) {
    positions[3 * i] = m.vertProperties[m.numProp * i];
    positions[3 * i + 1] = m.vertProperties[m.numProp * i + 1];
    positions[3 * i + 2] = m.vertProperties[m.numProp * i + 2];
  }
  return { positions, indices: new Uint32Array(m.triVerts) };
}

/**
 * Süpürme kullanılabilir mi: her ada kendi yönünde yükseklik alanıysa
 * (düz/sığ yamalar). Değilse çıkıntı yöntemi denenir.
 */
export function shouldSweepSocket(mesh: MeshData, islands: Island[], opts: CutOptions): boolean {
  return islands.every((i) => isHeightField(mesh, i, socketDirection(i, opts)));
}

export function socketCut(
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
export function capProjections(opts: CutOptions): Projection[] {
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
export function partFrom(man: Manifold, labels: Uint16Array, slot: number): LabeledMesh {
  const m = fromManifoldMapped(man, labels, slot);
  for (let t = 0; t < m.labels.length; t++) if (m.labels[t] === BASE_SLOT) m.labels[t] = slot;
  return m;
}
