/**
 * X46: parçaları baskı plakasına yerleştirme.
 *
 * 1. Her parça Z ekseni etrafında, XY izdüşümünün sınır dikdörtgeni en küçük
 *    olacak açıyla döndürülür (dışbükey zarfın kenar yönleri denenir: en
 *    küçük alanlı dikdörtgen bir kenara paraleldir). Kazanç %3'ten azsa
 *    döndürülmez.
 * 2. Raf yerleştirme: parçalar yüksekliğe (Y boyu) göre büyükten küçüğe
 *    sıralanır, plaka genişliğince raflara dizilir.
 * Plakaya sığmayan varsa `fits` false döner (yine de dizilir).
 */

export interface Footprint {
  /** Z etrafında dönüş, radyan. */
  angle: number;
  /** Döndürülmüş XY sınırları. */
  min: [number, number];
  max: [number, number];
}

export interface Placement {
  angle: number;
  /** Döndürülmüş parçaya eklenecek öteleme (plaka koordinatı). */
  offset: [number, number];
}

/** XY dışbükey zarf (monoton zincir). Çok büyük mesh'te noktalar seyreltilir. */
function hull2d(positions: Float32Array): [number, number][] {
  const n = positions.length / 3;
  const step = Math.max(1, Math.floor(n / 50000));
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i += step) pts.push([positions[3 * i], positions[3 * i + 1]]);
  // seyreltmede uç noktalar kaçmasın: eksen uçları eklenir
  if (step > 1) {
    const ext = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (positions[3 * i] < positions[3 * ext[0]]) ext[0] = i;
      if (positions[3 * i] > positions[3 * ext[1]]) ext[1] = i;
      if (positions[3 * i + 1] < positions[3 * ext[2] + 1]) ext[2] = i;
      if (positions[3 * i + 1] > positions[3 * ext[3] + 1]) ext[3] = i;
    }
    for (const i of ext) pts.push([positions[3 * i], positions[3 * i + 1]]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function boundsAt(
  hull: [number, number][],
  angle: number,
): { min: [number, number]; max: [number, number] } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const min: [number, number] = [Infinity, Infinity];
  const max: [number, number] = [-Infinity, -Infinity];
  for (const [x, y] of hull) {
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    min[0] = Math.min(min[0], rx);
    min[1] = Math.min(min[1], ry);
    max[0] = Math.max(max[0], rx);
    max[1] = Math.max(max[1], ry);
  }
  return { min, max };
}

/** En küçük alanlı sınır dikdörtgenini veren Z dönüşü. */
export function minFootprint(positions: Float32Array): Footprint {
  const hull = hull2d(positions);
  const area = (b: { min: number[]; max: number[] }) =>
    (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
  const straight = boundsAt(hull, 0);
  let best = { angle: 0, ...straight };
  let bestArea = area(straight);
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    // kenarı X eksenine çeviren açı
    const angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const bounds = boundsAt(hull, angle);
    const ar = area(bounds);
    if (ar < bestArea) {
      bestArea = ar;
      best = { angle, ...bounds };
    }
  }
  // az kazanç için döndürme (parçalar düzgün hizalı kalsın)
  if (bestArea > area(straight) * 0.97) best = { angle: 0, ...straight };
  // uzun kenar X boyunca: raflar daha az yükselir
  const w = best.max[0] - best.min[0];
  const h = best.max[1] - best.min[1];
  if (h > w * 1.01) {
    const angle = best.angle + Math.PI / 2;
    best = { angle, ...boundsAt(hull, angle) };
  }
  return best;
}

/** Raf yerleştirme. Plaka 0..bed; parçalar plakanın ortasına hizalanır. */
export function arrangeOnPlate(
  footprints: Footprint[],
  bed: number,
  gap: number,
): { placements: Placement[]; fits: boolean } {
  const size = footprints.map((f) => [f.max[0] - f.min[0], f.max[1] - f.min[1]] as const);
  const order = footprints.map((_, i) => i).sort((a, b) => size[b][1] - size[a][1]);
  const at: [number, number][] = new Array(footprints.length);
  const width = bed - 2 * gap;
  let x = 0;
  let y = 0;
  let shelf = 0;
  let usedW = 0;
  for (const i of order) {
    const [w, h] = size[i];
    if (x > 0 && x + w > width) {
      x = 0;
      y += shelf + gap;
      shelf = 0;
    }
    at[i] = [x, y];
    x += w + gap;
    usedW = Math.max(usedW, x - gap);
    shelf = Math.max(shelf, h);
  }
  const usedH = y + shelf;
  const ox = (bed - usedW) / 2;
  const oy = (bed - usedH) / 2;
  const placements = footprints.map((f, i) => ({
    angle: f.angle,
    offset: [at[i][0] - f.min[0] + ox, at[i][1] - f.min[1] + oy] as [number, number],
  }));
  return { placements, fits: usedW <= bed && usedH <= bed };
}
