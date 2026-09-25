import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { cutRegion } from '../src/core/cut';
import { faceCentroids, faceNormalsAndAreas } from '../src/core/geometry';
import { fromManifold, initKernel, toManifold } from '../src/core/kernel';
import { chooseSmartScale, meanEdgeLength } from '../src/core/paint';
import { repairMesh } from '../src/core/repair';
import { buildAdjacency } from '../src/core/topology';
import { write3mfBambu } from '../src/io/bambu3mf';

// Elle çalıştırılır: SAMPLE=1 npx vitest run test/make-bambu-sample.test.ts
it.skipIf(!process.env.SAMPLE || !existsSync('samples/testa.stl'))(
  'testa -> Bambu 3MF örneği',
  async () => {
    await initKernel();
    const buf = readFileSync('samples/testa.stl');
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 9; k++) pos[9 * t + k] = buf.readFloatLE(84 + t * 50 + 12 + 4 * k);
    const man = toManifold(repairMesh(pos).mesh);
    let mesh = fromManifold(man, 0);
    mesh.labels.fill(0);
    const paint = (p: number[], slot: number) => {
      const adj = buildAdjacency(mesh);
      const { normals, areas } = faceNormalsAndAreas(mesh);
      const c = faceCentroids(mesh);
      let seed = 0;
      let bd = Infinity;
      for (let t = 0; t < areas.length; t++) {
        const d = Math.hypot(c[3 * t] - p[0], c[3 * t + 1] - p[1], c[3 * t + 2] - p[2]);
        if (d < bd) {
          bd = d;
          seed = t;
        }
      }
      for (const t of chooseSmartScale(adj, normals, c, areas, seed, meanEdgeLength(mesh), {
        maxAngleDeg: 20,
        concaveOnly: true,
      }).tris)
        mesh.labels[t] = slot;
    };
    const opts = {
      mode: 'socket' as const,
      depth: 2,
      clearance: 0.2,
      pin: { shape: 'cylinder' as const, radius: 2, length: 8, onPart: true },
    };
    paint([45.1, 2.2, 43.2], 1);
    const nose = cutRegion(mesh, { ...opts, slot: 1 });
    mesh = nose.body;
    paint([30.4, 14, 44.7], 2);
    paint([56.2, 22.8, 49.2], 2);
    const eyes = cutRegion(mesh, { ...opts, slot: 2 });
    const out = write3mfBambu(
      [
        { name: 'testa gövde', mesh: eyes.body, color: '#F1C40F' },
        { name: 'testa burun', mesh: nose.parts[0], color: '#161616' },
        ...eyes.parts.map((m, i) => ({ name: `testa göz ${i + 1}`, mesh: m, color: '#161616' })),
      ],
      { title: 'testa' },
    );
    writeFileSync('samples/testa-bambu.3mf', out);
  },
  120000,
);
