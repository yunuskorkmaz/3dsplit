import { beforeAll, describe, expect, it } from 'vitest';
import { type CutOptions, cutRegion } from '../src/core/cut';
import { signedVolume } from '../src/core/geometry';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { labelWhere } from './fixtures';

const opts = (mode: CutOptions['mode']): CutOptions => ({
  mode,
  slot: 1,
  depth: 2,
  clearance: 0.2,
  squeeze: 0,
  inset: 0,
  pin: {
    shape: 'cylinder',
    radius: 1.5,
    length: 6,
    onPart: true,
    depthClearance: 0.3,
    chamfer: 0.4,
    bodyRatio: 0.5,
    auto: true,
  },
});

describe('X75 kırıntısız kesim', () => {
  beforeAll(async () => {
    await initKernel();
  });

  /** Gövde + kol; kolun çevresinde ayrı kabuk kayış, kolun ucunda 0,3 mm³ kırıntı kabuk. */
  function figure() {
    const { Manifold, CrossSection } = kernel();
    const solid = Manifold.union([
      Manifold.cube([20, 20, 20], true),
      Manifold.cylinder(20, 4, 4, 32).rotate([0, 90, 0]).translate([10, 0, 0]),
    ]);
    const strap = CrossSection.circle(0.4, 12)
      .translate([4.5, 0])
      .revolve(48)
      .rotate([0, 90, 0])
      .translate([20, 0, 0]);
    const crumb = Manifold.sphere(0.4, 12).translate([25, 0, 8]);
    const man = Manifold.compose([solid, strap, crumb]).refineToLength(1);
    const mesh = fromManifold(man, 0);
    man.delete();
    return labelWhere(mesh, 1, (x) => x > 12);
  }

  it('Pimli kes: kayış kola katılır, kırıntı çıkmaz', () => {
    const r = cutRegion(figure(), opts('keys'));
    expect(r.parts.length).toBe(1);
    // kol (~π·16·18 ≈ 905) + kayış (~2π²·4.5·0.16 ≈ 14)
    expect(Math.abs(signedVolume(r.parts[0]))).toBeGreaterThan(900);
    expect(r.warnings.join(' ')).toContain('katıldı');
  });

  it('Fast ve Tapa: aynı', () => {
    expect(cutRegion(figure(), opts('fast')).parts.length).toBe(1);
    expect(cutRegion(figure(), opts('socket')).parts.length).toBe(1);
  });
});
