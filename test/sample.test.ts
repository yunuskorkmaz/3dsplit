import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { boundingBox } from '../src/core/geometry';
import { initKernel } from '../src/core/kernel';
import { sampleFigure } from '../src/core/sample';

describe('X83 örnek model', () => {
  beforeAll(async () => {
    await initKernel();
  });

  it('samples/figure.stl ile aynı figür, kapalı', () => {
    const mesh = sampleFigure();
    const stl = readFileSync(new URL('../samples/figure.stl', import.meta.url));
    const tris = stl.readUInt32LE(80);
    expect(mesh.indices.length / 3).toBe(tris);
    const box = boundingBox(mesh.positions);
    // baş 14 mm küre z=62'de, kollar ±44 mm
    expect(box.max[2]).toBeCloseTo(76, 0);
    expect(box.max[0]).toBeCloseTo(44, 0);
    expect(mesh.labels.every((l) => l === 0)).toBe(true);
  });
});
