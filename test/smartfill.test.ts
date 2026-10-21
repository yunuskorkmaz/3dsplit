import { beforeAll, describe, expect, it } from 'vitest';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { smartFill } from '../src/core/paint';
import { buildAdjacency } from '../src/core/topology';
import type { LabeledMesh } from '../src/core/types';

let boss: LabeledMesh;

beforeAll(async () => {
  await initKernel();
  const { Manifold } = kernel();
  // 20 mm küpün üstünde 6x6x4 mm çıkıntı; yoğun mesh
  const base = Manifold.cube([20, 20, 20], true);
  const top = Manifold.cube([6, 6, 4], true).translate([0, 0, 12]);
  const m = Manifold.union(base, top).refineToLength(0.5);
  boss = fromManifold(m, 0);
});

function fill(seedPoint: [number, number, number], concaveOnly: boolean, scale: number) {
  const adj = buildAdjacency(boss);
  const { normals, areas } = faceNormalsAndAreas(boss);
  const c = faceCentroids(boss);
  let seed = 0;
  let best = Infinity;
  for (let t = 0; t < areas.length; t++) {
    const d = Math.hypot(
      c[3 * t] - seedPoint[0],
      c[3 * t + 1] - seedPoint[1],
      c[3 * t + 2] - seedPoint[2],
    );
    if (d < best) {
      best = d;
      seed = t;
    }
  }
  const tris = smartFill(adj, normals, c, seed, { maxAngleDeg: 30, scale, concaveOnly });
  let area = 0;
  for (const t of tris) area += areas[t];
  return area;
}

describe('smart fill çıkıntı', () => {
  it('concaveOnly: çıkıntının tüm yüzeyini seçip tabanda durur', () => {
    // üst yüz 36 + 4 yan yüz 6x4 = 132
    expect(fill([0, 0, 14], true, 2)).toBeCloseTo(132, 0);
  });

  it('normal mod: sadece tıklanan düz yüz', () => {
    expect(fill([0, 0, 14], false, 2)).toBeCloseTo(36, 0);
  });
});

describe('otomatik ölçek', () => {
  it('çıkıntı için kararlı bir ölçek seçer ve çıkıntıyı döndürür', async () => {
    const { chooseSmartScale, meanEdgeLength } = await import('../src/core/paint');
    const adj = buildAdjacency(boss);
    const { normals, areas } = faceNormalsAndAreas(boss);
    const c = faceCentroids(boss);
    let seed = 0;
    let best = Infinity;
    for (let t = 0; t < areas.length; t++) {
      const d = Math.hypot(c[3 * t], c[3 * t + 1], c[3 * t + 2] - 14);
      if (d < best) {
        best = d;
        seed = t;
      }
    }
    const r = chooseSmartScale(adj, normals, c, areas, seed, meanEdgeLength(boss), {
      maxAngleDeg: 20,
      concaveOnly: true,
    });
    let a = 0;
    for (const t of r.tris) a += areas[t];
    expect(r.leaked).toBe(false);
    expect(a).toBeCloseTo(132, 0);
  });
});

describe('X92: küçük tümseğin dibinde durur', () => {
  it('figür burnuna tıklayınca yalnız burun seçilir, baş değil', async () => {
    const { chooseSmartScale, meanEdgeLength } = await import('../src/core/paint');
    const { sampleFigure } = await import('../src/core/sample');
    const fig = sampleFigure();
    const adj = buildAdjacency(fig);
    const { normals, areas } = faceNormalsAndAreas(fig);
    const c = faceCentroids(fig);
    let seed = 0;
    let best = Infinity;
    for (let t = 0; t < areas.length; t++) {
      // burun ucu: r=3 küre, merkezi (0, -14, 62)
      const d = Math.hypot(c[3 * t], c[3 * t + 1] + 16.9, c[3 * t + 2] - 62);
      if (d < best) {
        best = d;
        seed = t;
      }
    }
    const r = chooseSmartScale(adj, normals, c, areas, seed, meanEdgeLength(fig), {
      maxAngleDeg: 20,
      concaveOnly: true,
    });
    let a = 0;
    let far = 0;
    for (const t of r.tris) {
      a += areas[t];
      far = Math.max(far, Math.hypot(c[3 * t], c[3 * t + 1] + 14, c[3 * t + 2] - 62));
    }
    // dışarıda kalan burun yüzeyi ~57 mm²; baş ~2300 mm² idi
    expect(a).toBeGreaterThan(40);
    expect(a).toBeLessThan(80);
    expect(far).toBeLessThan(3.2);
  });
});
