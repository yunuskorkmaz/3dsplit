import { beforeAll, describe, expect, it } from 'vitest';
import { assessSeam, CutError, cutRegion } from '../src/core/cut';
import { signedVolume } from '../src/core/geometry';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import type { LabeledMesh, MeshData } from '../src/core/types';
import { subdividedCube } from './fixtures';

function ring(mesh: MeshData, around: [number, number, number]): number[] {
  const ids: number[] = [];
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const z = mesh.positions[3 * i + 2];
    if (Math.abs(z - around[2]) > 1e-4) continue;
    ids.push(i);
  }
  ids.sort((a, b) => {
    const ax = mesh.positions[3 * a] - around[0];
    const ay = mesh.positions[3 * a + 1] - around[1];
    const bx = mesh.positions[3 * b] - around[0];
    const by = mesh.positions[3 * b + 1] - around[1];
    return Math.atan2(ay, ax) - Math.atan2(by, bx);
  });
  return ids;
}

const pin = { shape: 'cylinder' as const, radius: 1, length: 4, onPart: true, auto: true };

describe('dikiş', () => {
  let cube: LabeledMesh;

  beforeAll(async () => {
    await initKernel();
    const mesh = subdividedCube(10, 2);
    cube = { ...mesh, labels: new Uint16Array(mesh.indices.length / 3) };
  });

  it('düz halka küpü iki kapalı parçaya ayırır', () => {
    const loop = ring(cube, [0, 0, 0]);
    expect(loop.length).toBeGreaterThanOrEqual(4);
    const r = cutRegion(cube, {
      mode: 'fast',
      slot: 0,
      depth: 0,
      clearance: 0.2,
      pin,
      seamLoop: loop,
    });
    expect(r.parts).toHaveLength(1);
    const part = Math.abs(signedVolume(r.parts[0]));
    const body = Math.abs(signedVolume(r.body));
    expect(part + body).toBeCloseTo(1000, 0);
    expect(part).toBeGreaterThan(400);
    expect(body).toBeGreaterThan(400);
    for (const mesh of [r.body, r.parts[0]]) {
      expect(mesh.cut).toBeDefined();
      const flags = mesh.cut ?? new Uint8Array();
      expect(flags.length).toBe(mesh.labels.length);
      expect(flags.includes(1)).toBe(true);
      expect(flags.includes(0)).toBe(true);
    }
  });

  it('düzlemden sapan halkada kesmez', () => {
    const loop = ring(cube, [0, 0, 0]);
    const high = ring(cube, [0, 0, 5])[0];
    expect(() => assessSeam(cube, [...loop, high])).toThrow(CutError);
    try {
      assessSeam(cube, [...loop, high]);
    } catch (e) {
      expect(e).toBeInstanceOf(CutError);
      expect((e as CutError).message).toMatch(/düzlem/);
      expect((e as CutError).loops?.[0].length).toBeGreaterThan(3);
    }
  });

  it('düzlem iki gövdeyi birden kesince durur', () => {
    const { Manifold } = kernel();
    const merged = Manifold.union(
      Manifold.cube([6, 6, 6], true).translate([-8, 0, 0]),
      Manifold.cube([6, 6, 6], true).translate([8, 0, 0]),
    ).refineToLength(1.5);
    const mesh = fromManifold(merged, 0);
    const loop = ring(mesh, [-8, 0, 0]).filter((v) => mesh.positions[3 * v] < 0);
    expect(loop.length).toBeGreaterThanOrEqual(4);
    expect(() => assessSeam(mesh, loop)).toThrow(/birden fazla/);
  });

  it('düz olmayan ama ayıran halka çizgiyi izleyerek keser', () => {
    const raw = subdividedCube(10, 4);
    const mesh: LabeledMesh = { ...raw, labels: new Uint16Array(raw.indices.length / 3) };
    const at = (x: number, y: number, z: number) => {
      for (let i = 0; i < mesh.positions.length / 3; i++) {
        if (
          Math.abs(mesh.positions[3 * i] - x) < 1e-3 &&
          Math.abs(mesh.positions[3 * i + 1] - y) < 1e-3 &&
          Math.abs(mesh.positions[3 * i + 2] - z) < 1e-3
        )
          return i;
      }
      throw new Error(`köşe yok ${x},${y},${z}`);
    };
    const pts: [number, number, number][] = [
      [-5, -5, 0],
      [-2.5, -5, 0],
      [0, -5, 0],
      [2.5, -5, 0],
      [5, -5, 0],
      [5, -5, 2.5],
      [5, -2.5, 2.5],
      [5, 0, 2.5],
      [5, 2.5, 2.5],
      [5, 5, 2.5],
      [5, 5, 0],
      [2.5, 5, 0],
      [0, 5, 0],
      [-2.5, 5, 0],
      [-5, 5, 0],
      [-5, 2.5, 0],
      [-5, 0, 0],
      [-5, -2.5, 0],
    ];
    const loop = pts.map(([x, y, z]) => at(x, y, z));
    expect(() => assessSeam(mesh, loop)).toThrow(/düzlem/);
    const r = cutRegion(mesh, {
      mode: 'fast',
      slot: 0,
      depth: 0,
      clearance: 0.2,
      pin,
      seamLoop: loop,
    });
    expect(r.parts).toHaveLength(1);
    const part = Math.abs(signedVolume(r.parts[0]));
    const body = Math.abs(signedVolume(r.body));
    expect(part).toBeGreaterThan(100);
    expect(body).toBeGreaterThan(100);
    expect(part + body).toBeCloseTo(1000, 0);
  });

  it('düz dikişte yüz boşluğu hacmi iki yandan düşer', () => {
    const loop = ring(cube, [0, 0, 0]);
    const r = cutRegion(cube, {
      mode: 'fast',
      slot: 0,
      depth: 0,
      clearance: 0.2,
      pin,
      seamLoop: loop,
      faceGap: 1,
    });
    const part = Math.abs(signedVolume(r.parts[0]));
    const body = Math.abs(signedVolume(r.body));
    expect(part).toBeGreaterThan(400);
    expect(part).toBeLessThan(480);
    expect(body).toBeGreaterThan(400);
    expect(body).toBeLessThan(480);
    expect(part + body).toBeCloseTo(900, 0);
  });

  it('pimli kesitte de iki parça kalır', () => {
    const loop = ring(cube, [0, 0, 0]);
    const r = cutRegion(cube, {
      mode: 'keys',
      slot: 0,
      depth: 0,
      clearance: 0.2,
      pin,
      seamLoop: loop,
    });
    expect(Math.abs(signedVolume(r.parts[0]))).toBeGreaterThan(400);
    expect(Math.abs(signedVolume(r.body))).toBeGreaterThan(400);
  });
});
