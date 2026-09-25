import { beforeAll, describe, expect, it } from 'vitest';
import { faceNormalsAndAreas, signedVolume } from '../src/core/geometry';
import { initKernel } from '../src/core/kernel';
import { refineMesh } from '../src/core/refine';
import { labelWhere, subdividedCube } from './fixtures';

beforeAll(async () => {
  await initKernel();
});

describe('inceltme', () => {
  it('kenarları kısaltır, hacmi ve etiket alanını korur', () => {
    const m = labelWhere(subdividedCube(20, 2), 1, (_x, _y, z) => z > 9.99);
    const r = refineMesh(m, 1);
    expect(r.labels.length).toBeGreaterThan(m.labels.length * 50);
    expect(signedVolume(r)).toBeCloseTo(8000, 1);
    const { areas } = faceNormalsAndAreas(r);
    let painted = 0;
    for (let t = 0; t < r.labels.length; t++) if (r.labels[t] === 1) painted += areas[t];
    expect(painted).toBeCloseTo(400, 1);
    let maxEdge = 0;
    for (let t = 0; t < r.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = r.indices[t + k];
        const b = r.indices[t + ((k + 1) % 3)];
        const d = Math.hypot(
          r.positions[3 * a] - r.positions[3 * b],
          r.positions[3 * a + 1] - r.positions[3 * b + 1],
          r.positions[3 * a + 2] - r.positions[3 * b + 2],
        );
        maxEdge = Math.max(maxEdge, d);
      }
    }
    // manifold kenarları yaklaşık böler; köşegenler hedefin biraz üstünde kalabilir
    expect(maxEdge).toBeLessThan(2);
  });

  it('çok küçük kenarda sınırı aşarsa reddeder', () => {
    const m = labelWhere(subdividedCube(200, 2), 1, () => false);
    expect(() => refineMesh(m, 0.05)).toThrow(/üçgen üretir/);
  });
});
