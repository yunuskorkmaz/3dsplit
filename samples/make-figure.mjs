// Test figürü: kafa + gövde + kollar. `node samples/make-figure.mjs` -> samples/figure.stl
import { writeFileSync } from 'node:fs';
import Module from 'manifold-3d';

const m = await Module();
m.setup();
const { Manifold } = m;
const head = Manifold.sphere(14, 64).translate([0, 0, 62]);
const body = Manifold.cylinder(40, 16, 12, 64).translate([0, 0, 10]);
const hips = Manifold.sphere(16, 64).scale([1, 0.8, 0.6]).translate([0, 0, 10]);
const arm = Manifold.cylinder(34, 5, 4, 32).rotate([0, 90, 0]);
const armL = arm.translate([10, 0, 42]);
const armR = arm.rotate([0, 0, 180]).translate([-10, 0, 42]);
const nose = Manifold.sphere(3, 24).translate([0, -14, 62]);
const fig = Manifold.union([head, body, hips, armL, armR, nose]).refineToLength(1.5);
const mesh = fig.getMesh();
const tri = mesh.triVerts.length / 3;
const buf = Buffer.alloc(84 + tri * 50);
buf.writeUInt32LE(tri, 80);
let off = 84;
for (let t = 0; t < tri; t++) {
  off += 12;
  for (let k = 0; k < 3; k++) {
    const v = mesh.triVerts[3 * t + k];
    for (let c = 0; c < 3; c++) {
      buf.writeFloatLE(mesh.vertProperties[mesh.numProp * v + c], off);
      off += 4;
    }
  }
  off += 2;
}
writeFileSync(new URL('./figure.stl', import.meta.url), buf);
console.log('figure.stl', tri, 'triangles');
