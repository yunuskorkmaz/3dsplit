import { describe, expect, it } from 'vitest';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import {
  loopSelfIntersects,
  regionInsideLoop,
  surfacePath,
  vertexNeighbors,
} from '../src/core/lasso';
import { buildAdjacency } from '../src/core/topology';
import { subdividedCube } from './fixtures';

describe('X36 çizgi aracı', () => {
  const m = subdividedCube(20, 20);
  const nbr = vertexNeighbors(m);
  const vAt = (x: number, y: number, z: number) => {
    let best = 0;
    let bd = Infinity;
    for (let v = 0; v < m.positions.length / 3; v++) {
      const d = Math.hypot(
        m.positions[3 * v] - x,
        m.positions[3 * v + 1] - y,
        m.positions[3 * v + 2] - z,
      );
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  };

  it('yüzeyde en kısa yol, köşeden köşeye bitişik', () => {
    const path = surfacePath(m, nbr, vAt(-6, -6, 10), vAt(6, -6, 10));
    expect(path.length).toBeGreaterThan(2);
    // düz çizgi üstünde: y hep -6
    for (const v of path) expect(m.positions[3 * v + 1]).toBeCloseTo(-6, 5);
  });

  it('kapalı halkanın içi en küçük bileşen', () => {
    const corners = [vAt(-4, -4, 10), vAt(4, -4, 10), vAt(4, 4, 10), vAt(-4, 4, 10)];
    const loop: number[] = [];
    for (let i = 0; i < 4; i++)
      loop.push(...surfacePath(m, nbr, corners[i], corners[(i + 1) % 4]).slice(0, -1));
    const adj = buildAdjacency(m);
    const { areas } = faceNormalsAndAreas(m);
    const inside = regionInsideLoop(m, adj, areas, loop);
    expect(inside).not.toBeNull();
    if (!inside) return;
    let area = 0;
    const c = faceCentroids(m);
    for (let t = 0; t < inside.length; t++) {
      if (!inside[t]) continue;
      area += areas[t];
      expect(Math.abs(c[3 * t])).toBeLessThan(4);
      expect(c[3 * t + 2]).toBeCloseTo(10, 5);
    }
    expect(area).toBeCloseTo(64, 3);
  });

  it('açık çizgi yüzeyi ayırmaz', () => {
    const loop = surfacePath(m, nbr, vAt(-4, 0, 10), vAt(4, 0, 10));
    const adj = buildAdjacency(m);
    const { areas } = faceNormalsAndAreas(m);
    // gidip geri dönen "halka" alan ayırmaz
    expect(regionInsideLoop(m, adj, areas, [...loop, ...loop.slice(1, -1).reverse()])).toBeNull();
  });
  it('X112: kendini kesen halkayı ayırt eder', () => {
    const loopOf = (pts: [number, number][]) => {
      const vs = pts.map(([x, y]) => vAt(x, y, 10));
      const loop: number[] = [];
      for (let i = 0; i < vs.length; i++)
        loop.push(...surfacePath(m, nbr, vs[i], vs[(i + 1) % vs.length]).slice(0, -1));
      return loop;
    };
    // kare: kesişmez
    expect(
      loopSelfIntersects(
        loopOf([
          [-4, -4],
          [4, -4],
          [4, 4],
          [-4, 4],
        ]),
      ),
    ).toBe(false);
    // papyon: köşegenler ortada kesişir
    expect(
      loopSelfIntersects(
        loopOf([
          [-4, -4],
          [4, 4],
          [4, -4],
          [-4, 4],
        ]),
      ),
    ).toBe(true);
  });
});
