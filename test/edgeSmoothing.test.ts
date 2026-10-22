import { beforeAll, describe, expect, it } from 'vitest';
import { fromManifold, initKernel, kernel } from '../src/core/kernel';
import { smoothCutEdge } from '../src/core/smooth';
import { boundaryLoops, buildAdjacency } from '../src/core/topology';
import type { LabeledMesh } from '../src/core/types';

let mesh: LabeledMesh;

/** 1 numaralı bölgenin sınır uzunluğu, mm. */
function boundaryLength(m: LabeledMesh): number {
  const adj = buildAdjacency(m);
  const mask = Uint8Array.from(m.labels, (l) => (l === 1 ? 1 : 0));
  let len = 0;
  for (const loop of boundaryLoops(m, adj, mask)) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      len += Math.hypot(
        m.positions[3 * a] - m.positions[3 * b],
        m.positions[3 * a + 1] - m.positions[3 * b + 1],
        m.positions[3 * a + 2] - m.positions[3 * b + 2],
      );
    }
  }
  return len;
}

beforeAll(async () => {
  await initKernel();
  const { Manifold } = kernel();
  mesh = fromManifold(Manifold.sphere(20, 96), 0);
  // üst kubbe, sınırı kaba ve dişli: merkezin z'si eşiğe göre, eşik açıya göre zikzak
  const p = mesh.positions;
  const idx = mesh.indices;
  for (let t = 0; t < mesh.labels.length; t++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += p[3 * idx[3 * t + k]] / 3;
      y += p[3 * idx[3 * t + k] + 1] / 3;
      z += p[3 * idx[3 * t + k] + 2] / 3;
    }
    const zig = Math.sin(Math.atan2(y, x) * 24) > 0 ? 1.5 : -1.5;
    mesh.labels[t] = z > 8 + zig ? 1 : 0;
  }
});

describe('X100: kenar düzeltme gücü', () => {
  it('güç arttıkça kesim sınırı kısalır (dişler gider), bölge alanı korunur', () => {
    const raw = boundaryLength(mesh);
    const light = boundaryLength(smoothCutEdge(mesh, 1, 'light'));
    const medium = boundaryLength(smoothCutEdge(mesh, 1, 'medium'));
    const strong = boundaryLength(smoothCutEdge(mesh, 1, 'strong'));
    // z=8 düzlemindeki çember çevresi ~ 2π·√(400−64) ≈ 115 mm
    expect(raw).toBeGreaterThan(light);
    expect(light).toBeGreaterThanOrEqual(medium);
    expect(medium).toBeGreaterThan(strong);
    expect(strong).toBeLessThan(130);
    expect(strong).toBeGreaterThan(100);
  });
});
