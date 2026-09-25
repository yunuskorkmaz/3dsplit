import { boundingBox, faceCentroids } from './geometry';
import { kernel } from './kernel';
import { TriangleGrid } from './spatial';
import type { LabeledMesh, MeshData, Vec3 } from './types';

export interface VoxelRepairResult {
  mesh: LabeledMesh;
  voxelSize: number;
  /** Kullanılan kapama yarıçapı, mm (bundan küçük delik ve boşluklar kapandı). */
  closedGap: number;
}

/**
 * A2: voxel yedek onarım. Temel onarımdan sonra hâlâ kapanmayan mesh'ler için.
 *
 * 1. Yüzey, voxel ızgarasına işlenir (üçgenler üzerinde sık örnekleme).
 * 2. Yüzey vokselleri kapama yarıçapı kadar genişletilir: bundan küçük delikler kapanır.
 *    Yarıçap, içeride hacim kalana kadar 1, 2, 4, 8, 16 voksel denenerek seçilir
 *    (en küçük işe yarayan: gereksiz ayrıntı kaybı olmasın).
 * 3. Izgaranın kenarından dışarısı taşırılır; ulaşılamayan her şey içeridir.
 * 4. Genişletme kadar geri daraltılır (morfolojik kapama), alan yumuşatılır ve
 *    manifold `levelSet` ile kapalı yüzeye çevrilir.
 * 5. Etiketler en yakın eski üçgenden aktarılır.
 *
 * Sonuç her zaman kapalıdır; voxel boyutundan küçük ayrıntı kaybolur.
 */
export function voxelRepair(mesh: LabeledMesh, resolution = 160): VoxelRepairResult {
  const maxClose = 16;
  const { min, max } = boundingBox(mesh.positions);
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const h = size / resolution;
  const pad = maxClose + 3;
  const o: Vec3 = [min[0] - pad * h, min[1] - pad * h, min[2] - pad * h];
  const dims = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k]) / h) + 2 * pad + 1) as [number, number, number];
  const [nx, ny, nz] = dims;
  const idx = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const cells = nx * ny * nz;

  // 1. yüzey vokselleri
  const surface = new Uint8Array(cells);
  const p = mesh.positions;
  const tris = mesh.indices;
  const mark = (x: number, y: number, z: number) => {
    const ix = Math.floor((x - o[0]) / h);
    const iy = Math.floor((y - o[1]) / h);
    const iz = Math.floor((z - o[2]) / h);
    if (ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz) surface[idx(ix, iy, iz)] = 1;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t];
    const b = 3 * tris[t + 1];
    const c = 3 * tris[t + 2];
    const lab = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    const lac = Math.hypot(p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]);
    const lbc = Math.hypot(p[c] - p[b], p[c + 1] - p[b + 1], p[c + 2] - p[b + 2]);
    const steps = Math.max(1, Math.ceil((Math.max(lab, lac, lbc) / h) * 2));
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps - i; j++) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        mark(w * p[a] + u * p[b] + v * p[c], w * p[a + 1] + u * p[b + 1] + v * p[c + 1], w * p[a + 2] + u * p[b + 2] + v * p[c + 2]);
      }
    }
  }

  // 2-4. kapama yarıçapını artırarak içerisi bulunana kadar dene
  let field: Float32Array | null = null;
  let closeRadius = 1;
  for (; closeRadius <= maxClose; closeRadius *= 2) {
    const dilated = dilate(surface, dims, closeRadius);
    const outside = floodOutside(dilated, dims);
    let inside = 0;
    let shell = 0;
    for (let c = 0; c < cells; c++) {
      if (dilated[c]) shell++;
      else if (!outside[c]) inside++;
    }
    // içeriye sızdıysa iç hacim yok denecek kadar az kalır
    if (inside < shell * 0.05) continue;
    const outsideGrown = dilate(outside, dims, closeRadius);
    field = new Float32Array(cells);
    for (let c = 0; c < cells; c++) field[c] = outsideGrown[c] ? -1 : 1;
    break;
  }
  if (!field) throw new Error('Voxel onarım: model kapatılamadı (çok büyük açıklıklar var).');
  const smooth = blur(field, dims);

  // yüzeye yakın örneklerde işaret voksel alanından, büyüklük orijinal üçgenlere gerçek
  // uzaklıktan: mevcut yüzey birebir korunur, sadece eksik yerler voksel alanından dolar
  const grid = new TriangleGrid(faceCentroids(mesh), h);
  const trilinear = (q: Vec3) => {
    const fx = (q[0] - o[0]) / h - 0.5;
    const fy = (q[1] - o[1]) / h - 0.5;
    const fz = (q[2] - o[2]) / h - 0.5;
    const x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const z0 = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - x0));
    const ty = Math.min(1, Math.max(0, fy - y0));
    const tz = Math.min(1, Math.max(0, fz - z0));
    let v = 0;
    for (let dz = 0; dz < 2; dz++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
          v += w * smooth[idx(x0 + dx, y0 + dy, z0 + dz)];
        }
      }
    }
    return v;
  };
  const sdf = (q: Vec3) => {
    const v = trilinear(q);
    if (Math.abs(v) > 0.9) return v * h;
    // en yakın orijinal üçgen: uzaklık ondan, işaret onun normalinden (önünde = dışarı)
    let best = Infinity;
    let sign = 0;
    const pp = mesh.positions;
    const ix = mesh.indices;
    for (const t of grid.within(q, 2 * h)) {
      const c = closestOnTriangle(q, pp, ix, t);
      const d = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
      if (d < best) {
        best = d;
        const a = 3 * ix[3 * t];
        const b = 3 * ix[3 * t + 1];
        const e = 3 * ix[3 * t + 2];
        const ux = pp[b] - pp[a], uy = pp[b + 1] - pp[a + 1], uz = pp[b + 2] - pp[a + 2];
        const wx = pp[e] - pp[a], wy = pp[e + 1] - pp[a + 1], wz = pp[e + 2] - pp[a + 2];
        const nx2 = uy * wz - uz * wy, ny2 = uz * wx - ux * wz, nz2 = ux * wy - uy * wx;
        const side = nx2 * (q[0] - c[0]) + ny2 * (q[1] - c[1]) + nz2 * (q[2] - c[2]);
        sign = side > 0 ? -1 : side < 0 ? 1 : Math.sign(v || 1);
      }
    }
    // yakında orijinal yüzey yoksa (delik) voksel alanı
    return best === Infinity ? v * h : sign * best;
  };
  const { Manifold } = kernel();
  const bounds = {
    min: [o[0], o[1], o[2]] as Vec3,
    max: [o[0] + nx * h, o[1] + ny * h, o[2] + nz * h] as Vec3,
  };
  const raw = Manifold.levelSet(sdf, bounds, h, 0);
  // levelSet çok sık üçgen üretir: voksel boyutunun altındaki sapmayla sadeleştir
  const man = raw.simplify(h * 0.5);
  raw.delete();
  try {
    const m = man.getMesh();
    const positions = new Float32Array(m.numVert * 3);
    for (let i = 0; i < m.numVert; i++) {
      positions[3 * i] = m.vertProperties[m.numProp * i];
      positions[3 * i + 1] = m.vertProperties[m.numProp * i + 1];
      positions[3 * i + 2] = m.vertProperties[m.numProp * i + 2];
    }
    const out: MeshData = { positions, indices: new Uint32Array(m.triVerts) };
    return { mesh: { ...out, labels: transferLabels(mesh, out, h) }, voxelSize: h, closedGap: 2 * closeRadius * h };
  } finally {
    man.delete();
  }
}

/** Üçgen üzerindeki en yakın nokta (Ericson, Real-Time Collision Detection 5.1.5). */
function closestOnTriangle(q: Vec3, p: Float32Array, idx: Uint32Array, t: number): Vec3 {
  const a = 3 * idx[3 * t];
  const b = 3 * idx[3 * t + 1];
  const c = 3 * idx[3 * t + 2];
  const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
  const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
  const apx = q[0] - p[a], apy = q[1] - p[a + 1], apz = q[2] - p[a + 2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  const dist = (x: number, y: number, z: number): Vec3 => [x, y, z];
  if (d1 <= 0 && d2 <= 0) return dist(p[a], p[a + 1], p[a + 2]);
  const bpx = q[0] - p[b], bpy = q[1] - p[b + 1], bpz = q[2] - p[b + 2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return dist(p[b], p[b + 1], p[b + 2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return dist(p[a] + v * abx, p[a + 1] + v * aby, p[a + 2] + v * abz);
  }
  const cpx = q[0] - p[c], cpy = q[1] - p[c + 1], cpz = q[2] - p[c + 2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return dist(p[c], p[c + 1], p[c + 2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return dist(p[a] + w * acx, p[a + 1] + w * acy, p[a + 2] + w * acz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return dist(p[b] + w * (p[c] - p[b]), p[b + 1] + w * (p[c + 1] - p[b + 1]), p[b + 2] + w * (p[c + 2] - p[b + 2]));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return dist(p[a] + abx * v + acx * w, p[a + 1] + aby * v + acy * w, p[a + 2] + abz * v + acz * w);
}

/** Her yeni üçgen, ağırlık merkezine en yakın eski üçgenin etiketini alır. */
function transferLabels(from: LabeledMesh, to: MeshData, h: number): Uint16Array {
  const labels = new Uint16Array(to.indices.length / 3);
  if (!from.labels.some((l) => l !== 0)) return labels;
  const grid = new TriangleGrid(faceCentroids(from), h * 2);
  const c = faceCentroids(to);
  for (let t = 0; t < labels.length; t++) {
    const n = grid.nearest([c[3 * t], c[3 * t + 1], c[3 * t + 2]], h * 6);
    labels[t] = n >= 0 ? from.labels[n] : 0;
  }
  return labels;
}

function floodOutside(solid: Uint8Array, dims: [number, number, number]): Uint8Array {
  const [nx, ny, nz] = dims;
  const outside = new Uint8Array(solid.length);
  const stack: number[] = [0];
  outside[0] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    const x = c % nx;
    const y = ((c / nx) | 0) % ny;
    const z = (c / (nx * ny)) | 0;
    const visit = (n: number) => {
      if (!outside[n] && !solid[n]) {
        outside[n] = 1;
        stack.push(n);
      }
    };
    if (x > 0) visit(c - 1);
    if (x < nx - 1) visit(c + 1);
    if (y > 0) visit(c - nx);
    if (y < ny - 1) visit(c + nx);
    if (z > 0) visit(c - nx * ny);
    if (z < nz - 1) visit(c + nx * ny);
  }
  return outside;
}

function dilate(src: Uint8Array, dims: [number, number, number], r: number): Uint8Array {
  let cur = src;
  const [nx, ny, nz] = dims;
  for (let it = 0; it < r; it++) {
    const next = cur.slice();
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const c = x + nx * (y + ny * z);
          if (!cur[c]) continue;
          if (x > 0) next[c - 1] = 1;
          if (x < nx - 1) next[c + 1] = 1;
          if (y > 0) next[c - nx] = 1;
          if (y < ny - 1) next[c + nx] = 1;
          if (z > 0) next[c - nx * ny] = 1;
          if (z < nz - 1) next[c + nx * ny] = 1;
        }
      }
    }
    cur = next;
  }
  return cur;
}

/** 3x3x3 kutu bulanıklığı: basamaklı yüzeyi yumuşatır. */
function blur(src: Float32Array, dims: [number, number, number]): Float32Array {
  const [nx, ny, nz] = dims;
  let cur = src;
  // eksen başına ayrık [1 2 1]/4 süzgeci
  const strides = [1, nx, nx * ny];
  const lens = [nx, ny, nz];
  for (let axis = 0; axis < 3; axis++) {
    const out = new Float32Array(cur.length);
    const s = strides[axis];
    for (let c = 0; c < cur.length; c++) {
      const coord = axis === 0 ? c % nx : axis === 1 ? ((c / nx) | 0) % ny : (c / (nx * ny)) | 0;
      const a = coord > 0 ? cur[c - s] : cur[c];
      const b = coord < lens[axis] - 1 ? cur[c + s] : cur[c];
      out[c] = 0.25 * a + 0.5 * cur[c] + 0.25 * b;
    }
    cur = out;
  }
  return cur;
}
