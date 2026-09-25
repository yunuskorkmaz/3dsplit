import { beforeAll, describe, expect, it } from 'vitest';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { refineToValley, triangleConcavity } from '../src/core/paint';
import { smoothRegionBoundary } from '../src/core/smooth';
import { signedVolume } from '../src/core/geometry';
import { labelWhere, subdividedCube } from './fixtures';
import { buildAdjacency } from '../src/core/topology';
import type { LabeledMesh } from '../src/core/types';

let boss: LabeledMesh;
let adj: Int32Array;
let normals: Float32Array;
let areas: Float32Array;
let c: Float32Array;

beforeAll(async () => {
  await initKernel();
  const { Manifold } = kernel();
  // küp üstünde 6x6x4 çıkıntı
  const m = Manifold.union(Manifold.cube([20, 20, 20], true), Manifold.cube([6, 6, 4], true).translate([0, 0, 12])).refineToLength(0.4);
  boss = fromManifold(m, 0);
  adj = buildAdjacency(boss);
  ({ normals, areas } = faceNormalsAndAreas(boss));
  c = faceCentroids(boss);
});

describe('içbükeylik', () => {
  it('çıkıntının dibinde pozitif, tepesinin kenarında negatif', () => {
    const conc = triangleConcavity(boss, normals, areas, 0.8);
    let valley = 0;
    let crest = 0;
    for (let t = 0; t < areas.length; t++) {
      const [x, y, z] = [c[3 * t], c[3 * t + 1], c[3 * t + 2]];
      // taban üstünde, çıkıntının hemen dibi
      if (Math.abs(z - 10) < 0.01 && Math.max(Math.abs(x), Math.abs(y)) < 3.4 && Math.max(Math.abs(x), Math.abs(y)) > 3) valley += conc[t];
      // çıkıntı tepesinin kenarı
      if (Math.abs(z - 14) < 0.01 && Math.max(Math.abs(x), Math.abs(y)) > 2.7) crest += conc[t];
    }
    expect(valley).toBeGreaterThan(0);
    expect(crest).toBeLessThan(0);
  });
});

function maskArea(mask: Uint8Array): number {
  let a = 0;
  for (let t = 0; t < mask.length; t++) if (mask[t]) a += areas[t];
  return a;
}

describe('vadiye oturtma', () => {
  // üst 36 + yanlar 4 x 6 x 4 = 96 -> çıkıntının tüm yüzeyi 132
  it('eksik seçim (sadece tepe) çıkıntının dibine kadar genişler', () => {
    const sel = new Uint8Array(areas.length);
    for (let t = 0; t < areas.length; t++) if (c[3 * t + 2] > 13.99) sel[t] = 1;
    const conc = triangleConcavity(boss, normals, areas, 0.8);
    expect(Math.abs(maskArea(refineToValley(adj, c, conc, sel, 5)) - 132)).toBeLessThan(10);
  });

  it('taşan seçim (dibin 2 mm ötesi) dibe geri çekilir', () => {
    const sel = new Uint8Array(areas.length);
    for (let t = 0; t < areas.length; t++) {
      const inBoss = c[3 * t + 2] > 10.001;
      const nearBase = Math.abs(c[3 * t + 2] - 10) < 0.001 && Math.max(Math.abs(c[3 * t]), Math.abs(c[3 * t + 1])) < 5;
      if (inBoss || nearBase) sel[t] = 1;
    }
    const conc = triangleConcavity(boss, normals, areas, 0.8);
    expect(Math.abs(maskArea(refineToValley(adj, c, conc, sel, 3)) - 132)).toBeLessThan(10);
  });
});

describe('sınır yumuşatma', () => {
  // üst yüzde (0.5 mm ızgara) dalgalı sınırlı disk: r < 5 + 0.8 sin(8θ)
  const make = () =>
    labelWhere(subdividedCube(20, 40), 1, (x, y, z) => z > 9.99 && Math.hypot(x, y) < 5 + 0.8 * Math.sin(8 * Math.atan2(y, x)));

  const stats = (m: { positions: Float32Array; indices: Uint32Array; labels: Uint16Array }) => {
    const a = buildAdjacency(m);
    const { areas: ar } = faceNormalsAndAreas(m);
    let area = 0;
    for (let t = 0; t < m.labels.length; t++) if (m.labels[t] === 1) area += ar[t];
    const rs: number[] = [];
    for (let t = 0; t < m.labels.length; t++) {
      if (m.labels[t] !== 1) continue;
      for (let e = 0; e < 3; e++) {
        if (m.labels[a[3 * t + e]] === 1) continue;
        const v = m.indices[3 * t + e];
        rs.push(Math.hypot(m.positions[3 * v], m.positions[3 * v + 1]));
      }
    }
    const mean = rs.reduce((x, y) => x + y, 0) / rs.length;
    const std = Math.sqrt(rs.reduce((x, y) => x + (y - mean) ** 2, 0) / rs.length);
    return { area, std, mean };
  };

  const smooth = (m: { positions: Float32Array; indices: Uint32Array; labels: Uint16Array }, radius: number) => {
    const a = buildAdjacency(m);
    const r = smoothRegionBoundary(m, a, 1, radius, (t) => m.labels[t] === 0, () => 0);
    return { positions: r.positions, indices: m.indices, labels: r.labels };
  };

  it('dalgalı sınırı düzleştirir, alanı korur', () => {
    const m = make();
    const s0 = stats(m);
    const m1 = smooth(m, 2);
    const s1 = stats(m1);
    expect(s1.std).toBeLessThan(s0.std * 0.4);
    expect(Math.abs(s1.area - s0.area) / s0.area).toBeLessThan(0.05);
    // şekil değişmez: sınır köşeleri yüzeyde kalır
    expect(signedVolume(m1)).toBeCloseTo(8000, 2);
  });

  it('X30: kaba mesh\'te sınır üçgenlerin içinden geçer, mesh kapalı kalır', () => {
    // 2 mm ızgara: üçgen kenarına bağlı sınır ancak üçgen boyunda düzgün olabilir
    const m = labelWhere(subdividedCube(20, 10), 1, (x, y, z) => z > 9.99 && Math.hypot(x, y) < 5 + 0.8 * Math.sin(8 * Math.atan2(y, x)));
    const a = buildAdjacency(m);
    const snapped = smoothRegionBoundary(m, a, 1, 2, (t) => m.labels[t] === 0, () => 0);
    const exact = smoothRegionBoundary(m, a, 1, 2, (t) => m.labels[t] === 0, () => 0, true);
    expect(exact.labels.length).toBeGreaterThan(m.labels.length);
    // yeni köşeler eski kenarların üstünde: hacim birebir aynı, açık kenar yok
    expect(signedVolume(exact)).toBeCloseTo(8000, 2);
    const ea = buildAdjacency(exact);
    expect(ea.every((n) => n >= 0)).toBe(true);
    const se = stats(exact);
    // kalan sapma yumuşatılmış eğrinin kendisinden (2 mm ızgarada köşeli başlangıç seçimi)
    expect(se.std).toBeLessThan(stats(m).std * 0.4);
    expect(se.std).toBeLessThan(stats(snapped).std);
    expect(Math.abs(se.area - stats(m).area) / stats(m).area).toBeLessThan(0.1);
  });

  it('tekrar basmak bölgeyi daraltmaz', () => {
    const m1 = smooth(make(), 2);
    const m2 = smooth(m1, 2);
    const a1 = stats(m1).area;
    const a2 = stats(m2).area;
    expect(Math.abs(a2 - a1) / a1).toBeLessThan(0.03);
  });
});

describe('yumuşatma fırçası', () => {
  it('X38: bölmeden sonra komşuluk yerinde güncellenir, baştan kurulanla aynı', async () => {
    const { smoothStrokeSplit, applySplit } = await import('../src/core/smooth');
    const { patchAdjacency } = await import('../src/core/topology');
    const m = labelWhere(subdividedCube(20, 10), 1, (x, y, z) => z > 9.99 && Math.hypot(x, y) < 5 + 0.8 * Math.sin(8 * Math.atan2(y, x)));
    const path: [number, number, number][] = [];
    for (let a = -0.6; a <= 0.6; a += 0.1) path.push([5 * Math.cos(a), 5 * Math.sin(a), 10]);
    const diff = smoothStrokeSplit(m, 1, path, 2, 1, (t) => m.labels[t] === 0, () => 0);
    if (!diff) throw new Error('bölme yok');
    const out = applySplit(m, diff);
    const patched = patchAdjacency(buildAdjacency(m), out, diff.changedTris, diff.baseTris);
    expect(Array.from(patched)).toEqual(Array.from(buildAdjacency(out)));
  });

  it('X34: darbe izinde sınır üçgenlerin içinden geçer, fark geri alınabilir', async () => {
    const { smoothStrokeSplit, applySplit, revertSplit } = await import('../src/core/smooth');
    const m = labelWhere(subdividedCube(20, 10), 1, (x, y, z) => z > 9.99 && Math.hypot(x, y) < 5 + 0.8 * Math.sin(8 * Math.atan2(y, x)));
    // +x tarafında bir yay boyunca darbe
    const path: [number, number, number][] = [];
    for (let a = -0.6; a <= 0.6; a += 0.1) path.push([5 * Math.cos(a), 5 * Math.sin(a), 10]);
    const diff = smoothStrokeSplit(m, 1, path, 2, 1, (t) => m.labels[t] === 0, () => 0);
    expect(diff).not.toBeNull();
    if (!diff) return;
    expect(diff.addedIndices.length).toBeGreaterThan(0);
    const out = applySplit(m, diff);
    expect(signedVolume(out)).toBeCloseTo(8000, 2);
    expect(buildAdjacency(out).every((n) => n >= 0)).toBe(true);
    // izin uzağındaki (-x) üçgenler değişmez
    const c = faceCentroids(m);
    for (const t of diff.changedTris) expect(c[3 * t]).toBeGreaterThan(0);
    const back = revertSplit(out, diff);
    expect(back.indices).toEqual(m.indices);
    expect(back.labels).toEqual(m.labels);
    expect(back.positions).toEqual(m.positions);
  });

  it('X37: küçük fırçada köşe yarıçapın dörtte birinden fazla kaymaz', async () => {
    const { smoothBoundaryAt } = await import('../src/core/smooth');
    // kaba ızgara (2 mm) + küçük fırça: eskiden köşe kenarın %45'i kadar, fırçanın dışına kaçabiliyordu
    const m = labelWhere(subdividedCube(20, 10), 1, (x, y, z) => z > 9.99 && Math.hypot(x, y) < 5 + 0.8 * Math.sin(8 * Math.atan2(y, x)));
    const mesh = { positions: new Float32Array(m.positions), indices: m.indices, labels: Uint16Array.from(m.labels) };
    for (const r of [0.2, 0.5, 1]) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * 2 * Math.PI;
        const rad = 5 + 0.8 * Math.sin(8 * th);
        const before = new Float32Array(mesh.positions);
        smoothBoundaryAt(mesh, 1, [rad * Math.cos(th), rad * Math.sin(th), 10], r, 1, (t) => mesh.labels[t] === 0, () => 0);
        for (let k = 0; k < before.length; k++) {
          expect(Number.isFinite(mesh.positions[k])).toBe(true);
          expect(Math.abs(mesh.positions[k] - before[k])).toBeLessThanOrEqual(0.25 * r + 1e-5);
        }
      }
    }
  });

  it('sadece fırça altındaki dalgaları düzleştirir, alanı korur', async () => {
    const { smoothBoundaryAt } = await import('../src/core/smooth');
    const m = labelWhere(subdividedCube(20, 40), 1, (x, y, z) => z > 9.99 && Math.hypot(x, y) < 5 + 0.8 * Math.sin(8 * Math.atan2(y, x)));
    const mesh = { positions: new Float32Array(m.positions), indices: m.indices, labels: Uint16Array.from(m.labels) };
    const { areas: ar } = faceNormalsAndAreas(mesh);
    const area = () => mesh.labels.reduce((s2, l, t) => s2 + (l === 1 ? ar[t] : 0), 0);
    const a0 = area();
    // +x yönündeki sınırda birkaç darbe
    for (let i = 0; i < 6; i++) smoothBoundaryAt(mesh, 1, [5, 0, 10], 2.5, 1, (t) => mesh.labels[t] === 0, () => 0);
    // fırça altındaki (x > 3.5) sınır köşelerinin yarıçap sapması azalmalı, uzaktakiler değişmemeli
    const radii = (sel: (x: number, y: number) => boolean, pos: Float32Array, labels: Uint16Array) => {
      const aa = buildAdjacency({ positions: pos, indices: mesh.indices });
      const rs: number[] = [];
      for (let t = 0; t < labels.length; t++) {
        if (labels[t] !== 1) continue;
        for (let e = 0; e < 3; e++) {
          if (labels[aa[3 * t + e]] === 1) continue;
          const v = mesh.indices[3 * t + e];
          if (sel(pos[3 * v], pos[3 * v + 1])) rs.push(Math.hypot(pos[3 * v], pos[3 * v + 1]));
        }
      }
      const mu = rs.reduce((x, y) => x + y, 0) / rs.length;
      return Math.sqrt(rs.reduce((x, y) => x + (y - mu) ** 2, 0) / rs.length);
    };
    const nearBrush = (x: number, y: number) => Math.hypot(x - 5, y) < 1;
    const far = (x: number) => x < -3;
    expect(radii(nearBrush, mesh.positions, mesh.labels)).toBeLessThan(radii(nearBrush, m.positions, m.labels) * 0.6);
    expect(radii(far, mesh.positions, mesh.labels)).toBeCloseTo(radii(far, m.positions, m.labels), 5);
    expect(Math.abs(area() - a0) / a0).toBeLessThan(0.03);
  });
});
