import { beforeAll, describe, expect, it } from 'vitest';
import { capSplit, triangulateLoop } from '../src/core/cutCap';
import { findIslands } from '../src/core/cutRun';
import { fromManifold, initKernel, kernel, toManifold } from '../src/core/kernel';
import type { LabeledMesh } from '../src/core/types';

let mesh: LabeledMesh;

/** Üçgenin en küçük iç açısı, derece (3B). */
function minAngle3(p: Float32Array, a: number, b: number, c: number): number {
  const v = [a, b, c].map((i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
  let worst = 180;
  for (let e = 0; e < 3; e++) {
    const o = v[e];
    const q = v[(e + 1) % 3];
    const r = v[(e + 2) % 3];
    const u = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    const w = [r[0] - o[0], r[1] - o[1], r[2] - o[2]];
    const cross = Math.hypot(
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    );
    const ang = (Math.atan2(cross, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) * 180) / Math.PI;
    worst = Math.min(worst, ang);
  }
  return worst;
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

beforeAll(async () => {
  await initKernel();
  const { Manifold } = kernel();
  // 20 mm küre, üst kubbe boyalı (z > 12): kapak ~32 mm çaplı daire
  mesh = fromManifold(Manifold.sphere(20, 128), 0);
  const p = mesh.positions;
  const idx = mesh.indices;
  for (let t = 0; t < mesh.labels.length; t++) {
    const z = (p[3 * idx[3 * t] + 2] + p[3 * idx[3 * t + 1] + 2] + p[3 * idx[3 * t + 2] + 2]) / 3;
    mesh.labels[t] = z > 12 ? 1 : 0;
  }
});

describe('X100: kapak sıklaştırma', () => {
  it('kapak dolgun üçgenlerle örülür, parça ve gövde kapalı kalır', () => {
    const islands = findIslands(mesh, 1);
    const loop = islands[0].mainLoop;
    // önce: yalnız halka köşeleri, ince uzun üçgenler
    const old = triangulateLoop(mesh.positions, loop);
    const oldAngles: number[] = [];
    for (let i = 0; i < old.length; i += 3)
      oldAngles.push(minAngle3(mesh.positions, old[i], old[i + 1], old[i + 2]));

    const { body, parts } = capSplit(mesh, islands);
    const part = parts[0];
    const angles: number[] = [];
    let capTris = 0;
    for (let t = 0; t < part.origin.length; t++) {
      if (part.origin[t] < mesh.labels.length) continue;
      capTris++;
      angles.push(
        minAngle3(
          part.positions,
          part.indices[3 * t],
          part.indices[3 * t + 1],
          part.indices[3 * t + 2],
        ),
      );
    }
    expect(capTris).toBeGreaterThan(old.length / 3);
    expect(median(oldAngles)).toBeLessThan(15);
    expect(median(angles)).toBeGreaterThan(30);
    expect(() => toManifold(part).delete()).not.toThrow();
    expect(() => toManifold(body).delete()).not.toThrow();
  });
});
