import { beforeAll, describe, expect, it } from 'vitest';
import { fromManifold, initKernel, kernel, toManifold } from '../src/core/kernel';
import { simplifyMesh } from '../src/core/simplify';
import type { LabeledMesh } from '../src/core/types';

let dense: LabeledMesh;

beforeAll(async () => {
  await initKernel();
  const { Manifold } = kernel();
  // 20 mm küre, sık üçgenli; üst yarısı 2 numaralı boya
  dense = fromManifold(Manifold.sphere(10, 128).refineToLength(0.4), 0);
  const p = dense.positions;
  const idx = dense.indices;
  for (let t = 0; t < dense.labels.length; t++)
    dense.labels[t] = p[3 * idx[3 * t] + 2] > 0 && p[3 * idx[3 * t + 1] + 2] > 0 ? 2 : 0;
});

describe('X96: sadeleştirme', () => {
  it('hedefin altına iner, kapalı kalır, boya ve şekil korunur', () => {
    const target = Math.round(dense.labels.length / 4);
    const { mesh, tolerance } = simplifyMesh(dense, target);
    expect(mesh.labels.length).toBeLessThanOrEqual(target);
    expect(mesh.labels.length).toBeGreaterThan(target / 20);
    expect(() => toManifold(mesh).delete()).not.toThrow();
    // köşeler hâlâ kürenin üstünde (tolerans kadar)
    let worst = 0;
    for (let v = 0; v < mesh.positions.length; v += 3) {
      const r = Math.hypot(mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2]);
      worst = Math.max(worst, Math.abs(r - 10));
    }
    expect(worst).toBeLessThan(tolerance + 0.05);
    // boyanan üst yarı: üçgenlerin kabaca yarısı 2
    let painted = 0;
    for (const l of mesh.labels) if (l === 2) painted++;
    expect(painted / mesh.labels.length).toBeGreaterThan(0.35);
    expect(painted / mesh.labels.length).toBeLessThan(0.65);
  });
});
