import { strToU8, zipSync } from 'fflate';
import type { MeshData } from '../core/types';

export interface ExportObject {
  name: string;
  mesh: MeshData;
  /** #rrggbb */
  color: string;
  /** X109: Bambu 3MF'te korunacak filament numarası (3MF'ten gelen set). */
  filament?: number;
}

/** İkili STL. */
export function writeStl(mesh: MeshData, name = 'part'): Uint8Array {
  const triCount = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  const header = strToU8(name.slice(0, 79));
  new Uint8Array(buf, 0, header.length).set(header);
  view.setUint32(80, triCount, true);
  const p = mesh.positions;
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    const a = 3 * mesh.indices[3 * t];
    const b = 3 * mesh.indices[3 * t + 1];
    const c = 3 * mesh.indices[3 * t + 2];
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const v of [nx, ny, nz]) {
      view.setFloat32(off, v, true);
      off += 4;
    }
    for (const i of [a, b, c]) {
      for (let k = 0; k < 3; k++) {
        view.setFloat32(off, p[i + k], true);
        off += 4;
      }
    }
    off += 2;
  }
  return new Uint8Array(buf);
}

/** Her parça ayrı STL, tek ZIP içinde. */
export function writeStlZip(objects: ExportObject[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const o of objects)
    files[`${uniqueName(safeName(o.name), used)}.stl`] = writeStl(o.mesh, o.name);
  return zipSync(files);
}

/**
 * Çok nesneli 3MF. Her parça ayrı nesne ve ayrı renk (basematerials).
 * Orca/Bambu/Prusa nesneleri ayrı parçalar olarak açar.
 */
export function write3mf(objects: ExportObject[]): Uint8Array {
  const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const materials = objects
    .map((o) => `      <base name="${esc(o.name)}" displaycolor="${o.color.toUpperCase()}FF" />`)
    .join('\n');
  const objectXml: string[] = [];
  const items: string[] = [];
  objects.forEach((o, i) => {
    const id = i + 2;
    const p = o.mesh.positions;
    const verts: string[] = [];
    for (let v = 0; v < p.length; v += 3)
      verts.push(`<vertex x="${fmt(p[v])}" y="${fmt(p[v + 1])}" z="${fmt(p[v + 2])}"/>`);
    const tris: string[] = [];
    const idx = o.mesh.indices;
    for (let t = 0; t < idx.length; t += 3)
      tris.push(`<triangle v1="${idx[t]}" v2="${idx[t + 1]}" v3="${idx[t + 2]}"/>`);
    objectXml.push(
      `    <object id="${id}" name="${esc(o.name)}" type="model" pid="1" pindex="${i}">\n` +
        `      <mesh>\n        <vertices>${verts.join('')}</vertices>\n        <triangles>${tris.join('')}</triangles>\n      </mesh>\n    </object>`,
    );
    items.push(`    <item objectid="${id}" />`);
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1">
${materials}
    </basematerials>
${objectXml.join('\n')}
  </resources>
  <build>
${items.join('\n')}
  </build>
</model>
`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>
`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>
`;
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  });
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(5);
}

function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_ -]+/gu, '_').trim() || 'part';
}

function uniqueName(name: string, used: Set<string>): string {
  let n = name;
  let i = 2;
  while (used.has(n)) n = `${name}_${i++}`;
  used.add(n);
  return n;
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/octet-stream',
): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
