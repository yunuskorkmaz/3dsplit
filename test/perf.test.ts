import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import { fromManifold, initKernel, toManifold } from '../src/core/kernel';
import { chooseSmartScale, meanEdgeLength, triangleConcavity } from '../src/core/paint';
import { repairMesh } from '../src/core/repair';
import { buildAdjacency } from '../src/core/topology';

// Elle çalıştırılır: PERF=1 npx vitest run test/perf.test.ts
it.skipIf(!process.env.PERF || !existsSync('samples/testa.stl'))(
  '1M+ üçgen ölçümü',
  async () => {
    await initKernel();
    const file = 'samples/testa-1m.stl';
    if (!existsSync(file)) {
      const buf = readFileSync('samples/testa.stl');
      const n = buf.readUInt32LE(80);
      const pos = new Float32Array(n * 9);
      for (let t = 0; t < n; t++)
        for (let k = 0; k < 9; k++) pos[9 * t + k] = buf.readFloatLE(84 + t * 50 + 12 + 4 * k);
      const man = toManifold(repairMesh(pos).mesh).refineToLength(0.21);
      const m = man.getMesh();
      const tri = m.triVerts.length / 3;
      const out = Buffer.alloc(84 + tri * 50);
      out.writeUInt32LE(tri, 80);
      let off = 84;
      for (let t = 0; t < tri; t++) {
        off += 12;
        for (let k = 0; k < 3; k++) {
          const v = m.triVerts[3 * t + k];
          for (let c = 0; c < 3; c++) {
            out.writeFloatLE(m.vertProperties[m.numProp * v + c], off);
            off += 4;
          }
        }
        off += 2;
      }
      writeFileSync(file, out);
    }
    const buf = readFileSync(file);
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 9; k++) pos[9 * t + k] = buf.readFloatLE(84 + t * 50 + 12 + 4 * k);
    const time = <T>(label: string, fn: () => T): T => {
      const t0 = performance.now();
      const r = fn();
      console.log(label.padEnd(24), Math.round(performance.now() - t0), 'ms');
      return r;
    };
    console.log('üçgen', n);
    const { mesh: rep } = time('repairMesh', () => repairMesh(pos));
    const man = time('toManifold', () => toManifold(rep));
    const mesh = time('fromManifold', () => fromManifold(man, 0));
    const adj = time('buildAdjacency', () => buildAdjacency(mesh));
    const { normals, areas } = time('faceNormalsAndAreas', () => faceNormalsAndAreas(mesh));
    const c = time('faceCentroids', () => faceCentroids(mesh));
    const edge = time('meanEdgeLength', () => meanEdgeLength(mesh));
    time('triangleConcavity', () => triangleConcavity(mesh, normals, areas, edge * 3));
    let seed = 0;
    let bd = Infinity;
    for (let t = 0; t < areas.length; t++) {
      const d = Math.hypot(c[3 * t] - 56, c[3 * t + 1] - 62, c[3 * t + 2] - 82);
      if (d < bd) {
        bd = d;
        seed = t;
      }
    }
    time('chooseSmartScale (kulak)', () =>
      chooseSmartScale(adj, normals, c, areas, seed, edge, { maxAngleDeg: 20, concaveOnly: true }),
    );
  },
  600000,
);
