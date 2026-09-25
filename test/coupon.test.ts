import { beforeAll, describe, expect, it } from 'vitest';
import { toleranceCoupon } from '../src/core/coupon';
import { signedVolume } from '../src/core/geometry';
import { initKernel } from '../src/core/kernel';
import { buildAdjacency } from '../src/core/topology';

beforeAll(async () => {
  await initKernel();
});

describe('X35 tolerans deneme parçası', () => {
  it('her boşluk için delik ve pim; delikler boşlukla büyür', () => {
    const pin = { shape: 'cylinder' as const, radius: 2, length: 8, onPart: true, chamfer: 0.4 };
    const a = toleranceCoupon(pin, [0.1, 0.2, 0.3], 0.3);
    expect(a.pins.length).toBe(3);
    for (const m of [a.plate, ...a.pins]) {
      expect(signedVolume(m)).toBeGreaterThan(0);
      expect(buildAdjacency(m).every((n) => n >= 0)).toBe(true);
    }
    // daha geniş boşluk: plaka daha az hacimli
    const b = toleranceCoupon(pin, [0.3, 0.4, 0.5], 0.3);
    expect(signedVolume(b.plate)).toBeLessThan(signedVolume(a.plate) - 1);
    // pim hacmi ~ π r² L (pah düşülünce biraz az)
    expect(signedVolume(a.pins[0])).toBeGreaterThan(Math.PI * 4 * 8 * 0.9);
    expect(signedVolume(a.pins[0])).toBeLessThan(Math.PI * 4 * 8);
  });

  it('snap pim şekliyle de üretilir', () => {
    const c = toleranceCoupon(
      { shape: 'snap', radius: 2, length: 8, onPart: true },
      [0.1, 0.2],
      0.3,
    );
    expect(c.pins.length).toBe(2);
    expect(signedVolume(c.plate)).toBeGreaterThan(0);
  });
});
