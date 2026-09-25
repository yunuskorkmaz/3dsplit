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

  it('tekrar basmak bölgeyi daraltmaz', () => {
    const m1 = smooth(make(), 2);
    const m2 = smooth(m1, 2);
    const a1 = stats(m1).area;
    const a2 = stats(m2).area;
    expect(Math.abs(a2 - a1) / a1).toBeLessThan(0.03);
  });
});
