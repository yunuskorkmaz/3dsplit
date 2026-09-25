import { beforeAll, describe, expect, it } from 'vitest';
import { signedVolume } from '../src/core/geometry';
import { initKernel, toManifold } from '../src/core/kernel';
import { voxelRepair } from '../src/core/voxelRepair';
import { labelWhere, subdividedCube } from './fixtures';

beforeAll(async () => {
  await initKernel();
});

describe('voxel onarım', () => {
  it('büyük delikli, kısmen ters mesh: kapalı, hacim korunur, etiketler aktarılır', () => {
    const cube = labelWhere(subdividedCube(20, 10), 2, (_x, _y, z) => z > 9.99);
    // yan yüzden bir şerit sil (temel onarımın yelpazeyle kapatacağından büyük delik)
    const keep: number[] = [];
    const labels: number[] = [];
    for (let t = 0; t < cube.labels.length; t++) {
      const a = cube.indices[3 * t];
      const x = cube.positions[3 * a];
      const y = cube.positions[3 * a + 1];
      if (x > 9.99 && Math.abs(y) < 3) continue;
      keep.push(cube.indices[3 * t], cube.indices[3 * t + 1], cube.indices[3 * t + 2]);
      labels.push(cube.labels[t]);
    }
    const broken = { positions: cube.positions, indices: Uint32Array.from(keep), labels: Uint16Array.from(labels) };
    const t0 = performance.now();
    const r = voxelRepair(broken, 80);
    const ms = performance.now() - t0;
    expect(() => toManifold(r.mesh).delete()).not.toThrow();
    // küp 8000; voxel yuvarlaması köşeleri biraz yer
    expect(signedVolume(r.mesh)).toBeGreaterThan(7800);
    expect(signedVolume(r.mesh)).toBeLessThan(8400);
    // sadeleştirme: düz yüzler seyrek üçgenli
    expect(r.mesh.labels.length).toBeLessThan(40000);
    // üst yüz etiketi taşındı
    expect(r.mesh.labels.some((l) => l === 2)).toBe(true);
    expect(ms).toBeLessThan(15000);
  });
});
