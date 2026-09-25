import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import { fromManifold, initKernel, toManifold } from '../src/core/kernel';
import { chooseSmartScale, meanEdgeLength } from '../src/core/paint';
import { repairMesh } from '../src/core/repair';
import { buildAdjacency } from '../src/core/topology';
import type { LabeledMesh } from '../src/core/types';

// Gerçek model testi: samples/testa.stl (repoda yok) varsa çalışır.
const FILE = 'samples/testa.stl';

describe.skipIf(!existsSync(FILE))('testa.stl', () => {
  let mesh: LabeledMesh;
  let adj: Int32Array;
  let normals: Float32Array;
  let areas: Float32Array;
  let c: Float32Array;

  beforeAll(async () => {
    await initKernel();
    const buf = readFileSync(FILE);
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) pos[9 * t + k] = buf.readFloatLE(84 + t * 50 + 12 + 4 * k);
    const man = toManifold(repairMesh(pos).mesh);
    mesh = fromManifold(man, 0);
    man.delete();
    mesh.labels.fill(0);
    adj = buildAdjacency(mesh);
    ({ normals, areas } = faceNormalsAndAreas(mesh));
    c = faceCentroids(mesh);
  }, 60000);

  const near = (p: number[]) => {
    let b = 0;
    let bd = Infinity;
    for (let t = 0; t < areas.length; t++) {
      const d = Math.hypot(c[3 * t] - p[0], c[3 * t + 1] - p[1], c[3 * t + 2] - p[2]);
      if (d < bd) {
        bd = d;
        b = t;
      }
    }
    return b;
  };

  // [nokta, beklenen alan mm² aralığı]
  const features: Record<string, [number[], number, number]> = {
    göz: [[30.4, 14, 44.7], 30, 45],
    kaş: [[25.6, 18.2, 57], 35, 50],
    burun: [[45.1, 2.2, 43.2], 140, 170],
    kulak: [[56, 62, 82], 600, 1200],
  };
  for (const [name, [p, lo, hi]] of Object.entries(features)) {
    it(`otomatik ölçek: ${name}`, () => {
      const r = chooseSmartScale(adj, normals, c, areas, near(p), meanEdgeLength(mesh), { maxAngleDeg: 20, concaveOnly: true });
      let a = 0;
      for (const t of r.tris) a += areas[t];
      expect(r.leaked).toBe(false);
      expect(a).toBeGreaterThan(lo);
      expect(a).toBeLessThan(hi);
    });
  }
});
