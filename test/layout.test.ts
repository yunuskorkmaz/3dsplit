import { describe, expect, it } from 'vitest';
import { arrangeOnPlate, minFootprint } from '../src/io/layout';

/** XY'de verilen dikdörtgenin köşeleri (z=0 ve z=1), `angle` kadar döndürülmüş. */
function box(w: number, h: number, angle: number, cx = 0, cy = 0): Float32Array {
  const out: number[] = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const [x, y] of [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ]) {
    for (const z of [0, 1]) out.push(cx + x * c - y * s, cy + x * s + y * c, z);
  }
  return Float32Array.from(out);
}

describe('X46 plaka yerleştirme', () => {
  it('çapraz duran çubuğu en küçük izdüşüme döndürür, uzun kenar X boyunca', () => {
    const f = minFootprint(box(40, 5, Math.PI / 5));
    const w = f.max[0] - f.min[0];
    const h = f.max[1] - f.min[1];
    expect(w).toBeCloseTo(40, 3);
    expect(h).toBeCloseTo(5, 3);
  });

  it('eksene hizalı kutu döndürülmez', () => {
    expect(minFootprint(box(30, 10, 0)).angle).toBe(0);
  });

  it('parçalar plakada üst üste binmez ve plakaya sığar', () => {
    const fps = [
      box(40, 5, 0.3),
      box(20, 20, 0),
      box(60, 10, 1),
      box(10, 10, 0),
      box(15, 30, 0),
    ].map(minFootprint);
    const { placements, fits } = arrangeOnPlate(fps, 256, 5);
    expect(fits).toBe(true);
    const rects = fps.map((f, i) => {
      const [ox, oy] = placements[i].offset;
      return [f.min[0] + ox, f.min[1] + oy, f.max[0] + ox, f.max[1] + oy];
    });
    for (const r of rects) {
      expect(r[0]).toBeGreaterThanOrEqual(0);
      expect(r[1]).toBeGreaterThanOrEqual(0);
      expect(r[2]).toBeLessThanOrEqual(256);
      expect(r[3]).toBeLessThanOrEqual(256);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap =
          a[0] < b[2] + 4.99 && b[0] < a[2] + 4.99 && a[1] < b[3] + 4.99 && b[1] < a[3] + 4.99;
        expect(overlap, `${i}-${j}`).toBe(false);
      }
    }
  });

  it('sığmayan parçaları bildirir', () => {
    const fps = Array.from({ length: 12 }, () => minFootprint(box(120, 60, 0)));
    expect(arrangeOnPlate(fps, 256, 5).fits).toBe(false);
  });
});
