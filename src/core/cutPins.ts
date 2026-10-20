import type { Manifold } from 'manifold-3d';
import { triangulateLoop } from './cutCap';
import { findIslands } from './cutRun';
import { withFaceId } from './cutSocket';
import type { CutOptions, Island, PinOptions, PinPlacement, PinShape } from './cutTypes';
import { CUT_FACE_ID, kernel, Scope } from './kernel';
import type { LabeledMesh, Vec3 } from './types';
import { add, cross, dot, normalize, orthoBasis, scale, sub, vertexAt } from './vec';

export function pinDepthClearance(opts: CutOptions): number {
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

export function pinCenters(
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

export function checkPinContainment(
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
