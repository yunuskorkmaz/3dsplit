// Bozuk test modeli: figure.stl'den büyük bir şerit silinir, bazı üçgenler ters çevrilir,
// kopuk bir iç duvar eklenir. `node samples/make-broken.mjs` -> samples/broken.stl
import { readFileSync, writeFileSync } from 'node:fs';

const buf = readFileSync(new URL('./figure.stl', import.meta.url));
const n = buf.readUInt32LE(80);
const tris = [];
for (let t = 0; t < n; t++) {
  const v = [];
  for (let k = 0; k < 9; k++) v.push(buf.readFloatLE(84 + t * 50 + 12 + 4 * k));
  const cz = (v[2] + v[5] + v[8]) / 3;
  const cy = (v[1] + v[4] + v[7]) / 3;
  // gövdenin önünden 8 mm'lik şerit: büyük delik
  if (cy < -8 && cz > 20 && cz < 28) continue;
  // her 7. üçgen ters
  if (t % 7 === 0) tris.push([v[0], v[1], v[2], v[6], v[7], v[8], v[3], v[4], v[5]]);
  else tris.push(v);
}
// içeride kopuk tek bir üçgen (non-manifold çöp)
tris.push([0, 0, 30, 5, 0, 30, 0, 5, 30]);
const out = Buffer.alloc(84 + tris.length * 50);
out.writeUInt32LE(tris.length, 80);
tris.forEach((v, i) => v.forEach((x, k) => out.writeFloatLE(x, 84 + i * 50 + 12 + 4 * k)));
writeFileSync(new URL('./broken.stl', import.meta.url), out);
console.log('broken.stl', tris.length);
