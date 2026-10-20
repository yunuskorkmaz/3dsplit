import type { Manifold } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { suggestCutMode } from '../src/core/cut';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { labelWhere } from './fixtures';

function meshOf(build: () => Manifold) {
  const man = build().refineToLength(0.8);
  const mesh = fromManifold(man, 0);
  man.delete();
  return mesh;
}

describe('X72 kesim modu önerisi', () => {
  beforeAll(async () => {
    await initKernel();
  });

  it('kulakları boyanmamış baş: halkalar küçük ama bölge kalın, Pimli kes', () => {
    // at başı gibi: bölge neredeyse kapalı, sınır yalnız kulak diplerinde
    const mesh = meshOf(() => {
      const { Manifold } = kernel();
      const head = Manifold.sphere(8, 48);
      // kulaklar yanlarda, x ekseni boyunca
      const ear = Manifold.cylinder(5, 1.2, 0.6, 16).rotate([0, 90, 0]).translate([7.5, 0, 0]);
      return Manifold.union([
        head,
        ear,
        ear.rotate([0, 0, 180]),
        // gövde ayrı kabuk (at modelinde baş gövdeye değen ayrı kabuk)
        Manifold.cube([20, 10, 10], true).translate([0, 0, -20]),
      ]);
    });
    const region = labelWhere(mesh, 1, (x, _y, z) => z > -10 && Math.abs(x) < 8.3);
    const s = suggestCutMode(region, 1);
    expect(s?.mode).toBe('keys');
  });

  it('kol: Pimli kes', () => {
    const mesh = meshOf(() => {
      const { Manifold } = kernel();
      return Manifold.union([
        Manifold.cube([20, 20, 20], true),
        Manifold.cylinder(20, 4, 4, 32).rotate([0, 90, 0]).translate([10, 0, 0]),
      ]);
    });
    const region = labelWhere(mesh, 1, (x) => x > 12);
    expect(suggestCutMode(region, 1)?.mode).toBe('keys');
  });

  it('ince kuyruk: pim sığmaz, Tapa', () => {
    const mesh = meshOf(() => {
      const { Manifold } = kernel();
      return Manifold.union([
        Manifold.cube([20, 20, 20], true),
        Manifold.cylinder(15, 1.2, 1.2, 16).rotate([0, 90, 0]).translate([10, 0, 0]),
      ]);
    });
    const region = labelWhere(mesh, 1, (x) => x > 10.5);
    expect(suggestCutMode(region, 1)?.mode).toBe('socket');
  });

  it('göz: sığ tümsek, Tapa', () => {
    const mesh = meshOf(() => {
      const { Manifold } = kernel();
      return Manifold.union([
        Manifold.sphere(15, 64),
        Manifold.sphere(3, 24).translate([0, -14, 0]),
      ]);
    });
    const region = labelWhere(mesh, 1, (x, y, z) => Math.hypot(x, y + 14, z) < 3.3 && y < -14);
    expect(suggestCutMode(region, 1)?.mode).toBe('socket');
  });

  it('kaş: düz yüzeyde boya, Tapa', () => {
    const mesh = meshOf(() => kernel().Manifold.cube([30, 30, 30], true));
    const region = labelWhere(mesh, 1, (x, y, z) => z > 14.9 && Math.abs(x) < 8 && Math.abs(y) < 2);
    expect(suggestCutMode(region, 1)?.mode).toBe('socket');
  });
});
