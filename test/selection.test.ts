import { beforeAll, describe, expect, it } from 'vitest';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { meanEdgeLength, refineToValley, smoothBoundaryVertices, smoothSelection, triangleConcavity } from '../src/core/paint';
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
  it('tırtıklı sınırı düzeltir: çentik dolar, tek çıkıntı silinir', () => {
    const sel = new Uint8Array(areas.length);
    // üst yüzün x<0 yarısı
    for (let t = 0; t < areas.length; t++) if (c[3 * t + 2] > 13.99 && c[3 * t] < 0) sel[t] = 1;
    // çentik ve çıkıntı ekle
    let notch = -1;
    let bump = -1;
    for (let t = 0; t < areas.length; t++) {
      if (c[3 * t + 2] < 13.99) continue;
      if (notch < 0 && sel[t] && c[3 * t] > -0.3 && Math.abs(c[3 * t + 1]) < 0.5) notch = t;
      if (bump < 0 && !sel[t] && c[3 * t] < 0.3 && Math.abs(c[3 * t + 1] - 1.5) < 0.5) bump = t;
    }
    sel[notch] = 0;
    sel[bump] = 1;
    const out = smoothSelection(adj, c, areas, sel, 1, 2);
    expect(out[notch]).toBe(1);
    expect(out[bump]).toBe(0);
    expect(meanEdgeLength(boss)).toBeGreaterThan(0);
  });
});

describe('sınır köşesi yumuşatma', () => {
  it('merdiven sınırı çizgiye yaklaştırır, şekli değiştirmez', () => {
    // üst yüzde x + y < 0 bölgesi: sınır üçgen kenarlarında merdiven yapar
    const cube = labelWhere(subdividedCube(20, 20), 1, (x, y, z) => z > 9.99 && x + 1.3 * y < 0);
    const adjC = buildAdjacency(cube);
    const boundaryVerts = new Set<number>();
    for (let t = 0; t < cube.labels.length; t++) {
      if (cube.labels[t] !== 1) continue;
      for (let e = 0; e < 3; e++) {
        const n = adjC[3 * t + e];
        if (cube.labels[n] === 1) continue;
        boundaryVerts.add(cube.indices[3 * t + e]);
        boundaryVerts.add(cube.indices[3 * t + ((e + 1) % 3)]);
      }
    }
    const dev = (pos: Float32Array) => {
      let s2 = 0;
      let n = 0;
      for (const v of boundaryVerts) {
        if (pos[3 * v + 2] < 9.99) continue;
        const x = pos[3 * v];
        const y = pos[3 * v + 1];
        if (Math.abs(x) > 9 || Math.abs(y) > 9) continue; // kenarlardaki sabit uçlar hariç
        s2 += Math.abs(x + 1.3 * y) / Math.hypot(1, 1.3);
        n++;
      }
      return s2 / n;
    };
    const out = smoothBoundaryVertices(cube, adjC, 1);
    expect(dev(out)).toBeLessThan(dev(cube.positions) * 0.6);
    expect(signedVolume({ positions: out, indices: cube.indices })).toBeCloseTo(8000, 3);
  });
});
