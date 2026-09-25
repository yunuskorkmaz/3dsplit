import { describe, expect, it } from 'vitest';
import { faceCentroids } from '../src/core/geometry';
import { mirrorPoint, TriangleGrid } from '../src/core/spatial';
import { subdividedCube } from './fixtures';

describe('uzamsal ızgara', () => {
  it('en yakın üçgeni kaba aramayla aynı bulur', () => {
    const cube = subdividedCube(20, 12);
    const c = faceCentroids(cube);
    const grid = new TriangleGrid(c, 1);
    let seed = 3;
    for (let k = 0; k < 200; k++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const p: [number, number, number] = [
        (seed % 300) / 10 - 15,
        ((seed >> 8) % 300) / 10 - 15,
        ((seed >> 16) % 300) / 10 - 15,
      ];
      let best = -1;
      let bd = Infinity;
      for (let t = 0; t < c.length / 3; t++) {
        const d = (c[3 * t] - p[0]) ** 2 + (c[3 * t + 1] - p[1]) ** 2 + (c[3 * t + 2] - p[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      const got = grid.nearest(p);
      const dg =
        (c[3 * got] - p[0]) ** 2 + (c[3 * got + 1] - p[1]) ** 2 + (c[3 * got + 2] - p[2]) ** 2;
      expect(dg).toBeCloseTo(bd, 6);
      void best;
    }
  });

  it('küre içindeki üçgenler kaba aramayla aynı', () => {
    const cube = subdividedCube(20, 10);
    const c = faceCentroids(cube);
    const grid = new TriangleGrid(c, 1.5);
    const p: [number, number, number] = [9, 3, -2];
    const expected: number[] = [];
    for (let t = 0; t < c.length / 3; t++)
      if ((c[3 * t] - p[0]) ** 2 + (c[3 * t + 1] - p[1]) ** 2 + (c[3 * t + 2] - p[2]) ** 2 <= 16)
        expected.push(t);
    expect(grid.within(p, 4).sort((a, b) => a - b)).toEqual(expected);
  });

  it('ayna noktası', () => {
    expect(mirrorPoint([1, 2, 3], 0, 5)).toEqual([9, 2, 3]);
  });
});
