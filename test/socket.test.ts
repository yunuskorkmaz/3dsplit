import { beforeAll, describe, expect, it } from 'vitest';
import { cutRegion, previewCut } from '../src/core/cut';
import { faceCentroids, signedVolume } from '../src/core/geometry';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import type { LabeledMesh } from '../src/core/types';

let boss: LabeledMesh;

beforeAll(async () => {
  await initKernel();
  const { Manifold } = kernel();
  // 20 mm küpün üstünde 6x6x4 mm çıkıntı (burun/göz benzeri)
  const m = Manifold.union(Manifold.cube([20, 20, 20], true), Manifold.cube([6, 6, 4], true).translate([0, 0, 12])).refineToLength(1);
  boss = fromManifold(m, 0);
  boss.labels.fill(0); // manifold'un kendi faceID'leri etiket değil
  const c = faceCentroids(boss);
  for (let t = 0; t < boss.labels.length; t++) if (c[3 * t + 2] > 10.001) boss.labels[t] = 1;
});

const opts = {
  mode: 'socket' as const,
  slot: 1,
  depth: 3,
  clearance: 0.2,
  pin: { shape: 'cylinder' as const, radius: 2, length: 6, onPart: true },
};

describe('çıkıntı socket', () => {
  it('çıkıntı + gövdeye giren tapa; yuva clearance kadar büyük', () => {
    const r = cutRegion(boss, opts);
    expect(r.warnings).toEqual([]);
    expect(r.parts.length).toBe(1);
    // çıkıntı 6x6x4 + tapa 6x6x3
    expect(signedVolume(r.parts[0])).toBeCloseTo(144 + 108, 0);
    const body = signedVolume(r.body);
    expect(body).toBeLessThan(8000 - 108 - 5);
    expect(body).toBeGreaterThan(8000 - 6.4 * 6.4 * 3.2 - 1);
    expect(r.body.labels.includes(1)).toBe(false);
  });

  it('squeeze tapa tabanını daraltır (kesik piramit)', () => {
    const r = cutRegion(boss, { ...opts, squeeze: 0.5 });
    // daralma hacmin üstünden (yüzey + eps=1) tabana (-3) doğrusal: 6 -> 3 mm.
    // Yüzey seviyesinde genişlik 6 - 3/4 = 5.25; gövdedeki kısım 3/3 * (5.25² + 9 + 5.25*3)
    const a1 = 5.25 * 5.25;
    expect(signedVolume(r.parts[0])).toBeCloseTo(144 + (a1 + 9 + Math.sqrt(a1 * 9)), 0);
  });

  it('önizleme tapa prizmasını döndürür', () => {
    const p = previewCut(boss, opts);
    expect(p.volumes.length).toBe(1);
  });
});
