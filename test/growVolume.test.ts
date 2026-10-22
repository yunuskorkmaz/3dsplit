import { beforeAll, describe, expect, it } from 'vitest';
import { extrudePatch } from '../src/core/cutCap';
import { growVolume } from '../src/core/cutSocket';
import { initKernel, Scope, toManifold } from '../src/core/kernel';
import type { Vec3 } from '../src/core/types';

beforeAll(async () => {
  await initKernel();
});

/** 10 × 10 mm kubbe yaması (z = 1 - r²/50), 10 × 10 ızgara; dışa +z bakar. */
function dome() {
  const n = 10;
  const pos: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = i - n / 2;
      const y = j - n / 2;
      pos.push(x, y, 1 - (x * x + y * y) / 50);
    }
  const tris: number[] = [];
  const at = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      tris.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
      tris.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  const loop: number[] = [];
  for (let i = 0; i < n; i++) loop.push(at(i, 0));
  for (let j = 0; j < n; j++) loop.push(at(n, j));
  for (let i = n; i > 0; i--) loop.push(at(i, n));
  for (let j = n; j > 0; j--) loop.push(at(0, j));
  return { positions: Float32Array.from(pos), tris, loop };
}

describe('yuva payı (growVolume)', () => {
  it('eğri tabanın tamamı payı kadar iner; tek köşe çukuru (yelpaze) kalmaz', () => {
    const { positions, tris, loop } = dome();
    const dir: Vec3 = [0, 0, 1];
    const vol = extrudePatch(positions, tris, [loop], dir, 3, 0.5);
    const scope = new Scope();
    try {
      const c = 0.2;
      // Manifold köşeleri yeniden sıralar: sonucu konumdan bekleneniyle karşılaştır
      const after = growVolume(scope.keep(toManifold(vol, 1)), dir, c, scope).getMesh();
      const st = after.numProp;
      const surface = (x: number, y: number) => 1 - (x * x + y * y) / 50;
      let bottom = 0;
      let rim = 0;
      for (let i = 0; i < after.numVert; i++) {
        const x = after.vertProperties[st * i];
        const y = after.vertProperties[st * i + 1];
        const z = after.vertProperties[st * i + 2];
        if (Math.abs(x) < 4.9 && Math.abs(y) < 4.9) {
          // iç köşe: yana kaymamış, taban payı kadar inmiş, üst yerinde
          if (z < -1) {
            bottom++;
            expect(z).toBeCloseTo(surface(x, y) - 3 - c, 4);
          } else expect(z).toBeCloseTo(surface(x, y) + 0.5, 4);
        } else {
          // halka köşesi payı kadar dışarıda
          rim++;
          expect(Math.max(Math.abs(x), Math.abs(y))).toBeGreaterThan(5 + 0.5 * c);
        }
      }
      expect(bottom).toBe(81);
      expect(rim).toBe(80);
    } finally {
      scope.dispose();
    }
  });
});
