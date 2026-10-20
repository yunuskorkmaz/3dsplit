/**
 * X73: otomatik pini kesitin içine, kenardan uzağa oturtur. Aday yerler kesit
 * çokgeninde ızgarayla taranır; her adayda kenara uzaklık (yarıçap + tolerans
 * + duvar) ve pim boyunca iki tarafta yeterli et (ışınla) aranır. Hedefe en
 * yakın uygun aday seçilir; hiçbiri uymazsa pin konmaz.
 */
import type { Island, PinOptions } from './cutTypes';
import type { MeshData, Vec3 } from './types';
import { add, cross, dot, orthoBasis, scale, sub, vertexAt } from './vec';

export interface PinFit {
  clearance: number;
  /** Pim çevresinde kalması gereken en az duvar, mm. */
  wall: number;
  /** Pim deliğinin uçlardaki payı, mm. */
  depthClearance: number;
}

/** Izgara kenarı başına aday sayısı. */
const GRID = 19;
/** Pim kenarında ışınla bakılan nokta sayısı. */
const RIM = 8;

type P2 = [number, number];

export interface Section {
  u: Vec3;
  v: Vec3;
  origin: Vec3;
  normal: Vec3;
  poly: P2[];
  /** Pim boyunca bakılan bölgedeki üçgenler (köşe numaraları, 3'lü). */
  tris: number[];
}

/**
 * Adanın ana kesit halkası, kapak düzlemine izdüşmüş. Işınlar kapak normali
 * boyunca gider: yalnız kesit kutusunun bu yöndeki prizmasına düşen üçgenler tutulur.
 */
export function sectionOf(mesh: MeshData, island: Island, margin: number): Section {
  const normal = island.capNormal;
  const [u, v] = orthoBasis(normal);
  const origin = island.capCenter;
  const { positions: p, indices: idx } = mesh;
  const local = (i: number): P2 => {
    const d = sub(vertexAt(p, i), origin);
    return [dot(d, u), dot(d, v)];
  };
  const poly = island.mainLoop.map(local);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x - margin);
    x1 = Math.max(x1, x + margin);
    y0 = Math.min(y0, y - margin);
    y1 = Math.max(y1, y + margin);
  }
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length / 3; i++) [uv[2 * i], uv[2 * i + 1]] = local(i);
  const tris: number[] = [];
  for (let t = 0; t < idx.length / 3; t++) {
    const a = idx[3 * t];
    const b = idx[3 * t + 1];
    const c = idx[3 * t + 2];
    if (Math.max(uv[2 * a], uv[2 * b], uv[2 * c]) < x0) continue;
    if (Math.min(uv[2 * a], uv[2 * b], uv[2 * c]) > x1) continue;
    if (Math.max(uv[2 * a + 1], uv[2 * b + 1], uv[2 * c + 1]) < y0) continue;
    if (Math.min(uv[2 * a + 1], uv[2 * b + 1], uv[2 * c + 1]) > y1) continue;
    tris.push(a, b, c);
  }
  return { u, v, origin, normal, poly, tris };
}

function inside(poly: P2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function edgeDistance(poly: P2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const dx = poly[i][0] - ax;
    const dy = poly[i][1] - ay;
    const l2 = dx * dx + dy * dy || 1e-12;
    const s = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - ax - s * dx, y - ay - s * dy));
  }
  return best;
}

/**
 * `origin`dan `dir` yönünde katının içinde gidilebilen uzaklık: ilk çarpılan
 * yüzden çıkılıyorsa (yüz normali ışın yönünde) o uzaklık, giriliyorsa ya da
 * hiçbir şeye çarpmıyorsa nokta katının dışındadır: 0.
 */
function depthInside(positions: Float32Array, tris: number[], origin: Vec3, dir: Vec3): number {
  let best = Infinity;
  let exiting = false;
  for (let i = 0; i < tris.length; i += 3) {
    const a = vertexAt(positions, tris[i]);
    const e1 = sub(vertexAt(positions, tris[i + 1]), a);
    const e2 = sub(vertexAt(positions, tris[i + 2]), a);
    const h = cross(dir, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const s = sub(origin, a);
    const uu = f * dot(s, h);
    if (uu < 0 || uu > 1) continue;
    const q = cross(s, e1);
    const vv = f * dot(dir, q);
    if (vv < 0 || uu + vv > 1) continue;
    const d = f * dot(e2, q);
    if (d > 1e-6 && d < best) {
      best = d;
      exiting = dot(cross(e1, e2), dir) > 0;
    }
  }
  return exiting ? best : 0;
}

/** Pim kesitin hangi noktasına sığar; `taken`: aynı adada önceden konmuş pimler (2B). */
export function settlePin(
  mesh: MeshData,
  section: Section,
  target: Vec3,
  axis: Vec3,
  spec: PinOptions,
  fit: PinFit,
  bodyRatio: number,
  taken: { at: P2; radius: number }[],
): { point: Vec3; at: P2 } | null {
  const { poly, u, v, origin } = section;
  if (poly.length < 3) return null;
  const need = spec.radius + fit.clearance + fit.wall;
  const bodyDepth = spec.length * bodyRatio + fit.depthClearance + fit.wall;
  const partDepth = spec.length * (1 - bodyRatio) + fit.depthClearance + fit.wall;
  const d = sub(target, origin);
  const tx = dot(d, u);
  const ty = dot(d, v);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  // küçük ada: kesitin hiçbir yönü pime yetmiyor
  if (x1 - x0 < 2 * need && y1 - y0 < 2 * need) return null;
  const candidates: { x: number; y: number; cost: number }[] = [{ x: tx, y: ty, cost: 0 }];
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / GRID;
      const y = y0 + ((y1 - y0) * (j + 0.5)) / GRID;
      candidates.push({ x, y, cost: Math.hypot(x - tx, y - ty) });
    }
  candidates.sort((a, b) => a.cost - b.cost);
  const rimR = spec.radius + fit.clearance;
  const back = scale(axis, -1);
  for (const { x, y } of candidates) {
    if (!inside(poly, x, y) || edgeDistance(poly, x, y) < need) continue;
    if (taken.some((t) => Math.hypot(t.at[0] - x, t.at[1] - y) < t.radius + need)) continue;
    // pimin ekseni ve kenarı boyunca iki tarafta et yeterli mi
    let ok = true;
    for (let k = 0; k <= RIM && ok; k++) {
      const a = (2 * Math.PI * k) / RIM;
      const r = k === RIM ? 0 : rimR;
      const p = add(origin, add(scale(u, x + r * Math.cos(a)), scale(v, y + r * Math.sin(a))));
      ok =
        depthInside(mesh.positions, section.tris, p, axis) >= bodyDepth &&
        depthInside(mesh.positions, section.tris, p, back) >= partDepth;
    }
    if (ok) return { point: add(origin, add(scale(u, x), scale(v, y))), at: [x, y] };
  }
  return null;
}
