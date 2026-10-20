import { describe, expect, it } from 'vitest';
import { boundingBox, longestExtent, scaleMeshes, sizeWarning } from '../src/core/geometry';
import type { LabeledMesh } from '../src/core/types';
import { subdividedCube } from './fixtures';

function labeled(size: number, offset: number): LabeledMesh {
  const m = subdividedCube(size, 2);
  for (let i = 0; i < m.positions.length; i += 3) m.positions[i] += offset;
  return { ...m, labels: new Uint16Array(m.indices.length / 3) };
}

describe('X71 baskı boyu', () => {
  it('en uzun kenar mm', () => {
    expect(longestExtent([labeled(34, 0)])).toBeCloseTo(34, 4);
    // iki parça birlikte ölçülür
    expect(longestExtent([labeled(10, 0), labeled(10, 20)])).toBeCloseTo(30, 4);
  });

  it('250 üstü / 8 altı uyarı', () => {
    expect(sizeWarning(300)).toBe('large');
    expect(sizeWarning(5)).toBe('small');
    expect(sizeWarning(100)).toBeNull();
    expect(sizeWarning(250)).toBeNull();
    expect(sizeWarning(8)).toBeNull();
  });

  it('ölçekleme ortak merkezde, kaynak değişmez', () => {
    const a = labeled(10, 0);
    const b = labeled(10, 20);
    const before = a.positions.slice();
    const [sa, sb] = scaleMeshes([a, b], 100 / 30);
    expect(longestExtent([sa, sb])).toBeCloseTo(100, 3);
    expect(a.positions).toEqual(before);
    expect(sa.labels).not.toBe(a.labels);
    expect(sa.labels).toEqual(a.labels);
    // parçalar arası düzen korunur: ortak kutunun merkezi aynı kalır
    const box = (ms: LabeledMesh[]) => {
      const bs = ms.map((m) => boundingBox(m.positions));
      return (Math.min(...bs.map((x) => x.min[0])) + Math.max(...bs.map((x) => x.max[0]))) / 2;
    };
    expect(box([sa, sb])).toBeCloseTo(box([a, b]), 3);
  });
});
