import { beforeAll, describe, expect, it } from 'vitest';
import { type CutOptions, cutRegion, pinLayout } from '../src/core/cut';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { smoothCutEdge } from '../src/core/smooth';
import type { LabeledMesh } from '../src/core/types';
import { labelWhere } from './fixtures';

/** Uygulama kesimden önce sınırı üçgenlerin içinden geçirir (Kenarı düzelt). */
const edged = (m: LabeledMesh) => smoothCutEdge(m, 1);

const opts: CutOptions = {
  mode: 'keys',
  slot: 1,
  depth: 0,
  clearance: 0.2,
  squeeze: 0,
  inset: 0,
  minWall: 0.8,
  pin: {
    shape: 'cylinder',
    radius: 2,
    length: 8,
    onPart: true,
    depthClearance: 0.3,
    chamfer: 0.4,
    bodyRatio: 0.5,
    auto: true,
  },
};

const outside = (w: string[]) => w.filter((x) => x.includes('dışına taşıyor'));

describe('X73 pin kesitin içinde', () => {
  beforeAll(async () => {
    await initKernel();
  });

  it('U biçimli kesit: pin boşluğa değil kola düşer', () => {
    const { Manifold } = kernel();
    // dış 24x24, iç boşluk 16x20 (y+ yönüne açık): kollar 4 mm, taban 4 mm
    const man = Manifold.cube([24, 24, 40], true)
      .subtract(Manifold.cube([16, 20, 50], true).translate([0, 2.01, 0]))
      .refineToLength(1.5);
    const mesh = edged(labelWhere(fromManifold(man, 0), 1, (_x, _y, z) => z > 0));
    man.delete();
    const layout = pinLayout(mesh, opts);
    expect(layout.length).toBeGreaterThan(0);
    const r = cutRegion(mesh, opts);
    expect(outside(r.warnings)).toEqual([]);
  });

  it('iki bacak: her bacağa pin', () => {
    const { Manifold } = kernel();
    const leg = Manifold.cylinder(20, 4, 4, 32).translate([0, 0, -20]);
    const man = Manifold.union([
      Manifold.cube([30, 12, 8], true).translate([0, 0, 4]),
      leg.translate([-8, 0, 0]),
      leg.translate([8, 0, 0]),
    ]).refineToLength(1.5);
    const mesh = edged(labelWhere(fromManifold(man, 0), 1, (_x, _y, z) => z < -8));
    man.delete();
    const layout = pinLayout(mesh, opts);
    expect(layout.length).toBe(2);
    expect(outside(cutRegion(mesh, opts).warnings)).toEqual([]);
  });

  it('ince kayış: pin konmaz, nedeni yazılır', () => {
    const { Manifold } = kernel();
    const man = Manifold.union([
      Manifold.cube([30, 30, 30], true),
      Manifold.cube([1.2, 10, 20], true).translate([0, 0, 25]),
    ]).refineToLength(1);
    const mesh = edged(labelWhere(fromManifold(man, 0), 1, (_x, _y, z) => z > 16));
    man.delete();
    expect(pinLayout(mesh, opts).length).toBe(0);
    const r = cutRegion(mesh, opts);
    expect(outside(r.warnings)).toEqual([]);
    expect(r.warnings.join(' ')).toContain('pin için çok ince');
  });
});
