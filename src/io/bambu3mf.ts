import { strToU8, zipSync } from 'fflate';
import { boundingBox } from '../core/geometry';
import type { ExportObject } from './exportFile';

/**
 * Bambu Studio / OrcaSlicer'da parça başına filament atamasıyla açılan 3MF (A3).
 *
 * Yapı Bambu Studio'nun kendi kaydettiğiyle aynıdır: her parça
 * `3D/Objects/object_N.model` içinde, ana modelde bileşen olarak; parça
 * başına filament numarası `Metadata/model_settings.config` içinde
 * (`extruder`). Aynı renkteki parçalar aynı filament numarasını alır.
 * Parçalar tabanları yere oturacak şekilde plakaya yan yana dizilir.
 *
 * Yazıcı/işlem/filament ön ayarı (`project_settings.config`) bilerek
 * yazılmaz: eksik ön ayarlı bir "Bambu projesi" Bambu Studio'yu çökertiyor
 * (komut satırında denendi). Bu haliyle Bambu dosyayı dış 3MF olarak açar,
 * parça adlarını ve filament numaralarını korur, ayarlar Bambu'da seçili
 * ön ayarlardan gelir. Filament renkleri Bambu'da atanır.
 */
export function write3mfBambu(objects: ExportObject[], opts: { title?: string; bedSize?: number; gap?: number } = {}): Uint8Array {
  const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const bed = opts.bedSize ?? 256;
  const gap = opts.gap ?? 5;

  const colors = filamentColors(objects);
  const filamentOf = objects.map((o) => colors.indexOf(o.color.toUpperCase()) + 1);

  // plakaya dizme: satır satır, taban z=0, plakanın ortasına hizalı
  const boxes = objects.map((o) => boundingBox(o.mesh.positions));
  const placements: [number, number, number][] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let maxW = 0;
  const rowWidth = bed * 0.9;
  for (const b of boxes) {
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    if (x > 0 && x + w > rowWidth) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    placements.push([x - b.min[0], y - b.min[1], -b.min[2]]);
    x += w + gap;
    maxW = Math.max(maxW, x - gap);
    rowH = Math.max(rowH, h);
  }
  const totalH = y + rowH;
  const ox = (bed - maxW) / 2;
  const oy = (bed - totalH) / 2;

  const uuid = (a: number, b: number) =>
    `${a.toString(16).padStart(8, '0')}-${b.toString(16).padStart(4, '0')}-4000-8000-${(a * 7919 + b).toString(16).padStart(12, '0')}`;
  const header = (extra = '') =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n${extra} <metadata name="BambuStudio:3mfVersion">1</metadata>\n`;

  const files: Record<string, Uint8Array> = {};
  const objectXml: string[] = [];
  const items: string[] = [];
  const rels: string[] = [];
  const configObjects: string[] = [];
  const instances: string[] = [];

  objects.forEach((o, i) => {
    const n = i + 1;
    // alt dosyadaki nesne kimliği tüm dosyalarda benzersiz olmalı; aynı olursa
    // Bambu hepsini tek paylaşılan mesh sanıyor
    const innerId = 2 * n - 1;
    const outerId = 2 * n;
    const path = `/3D/Objects/object_${n}.model`;
    const p = o.mesh.positions;
    const idx = o.mesh.indices;
    const verts: string[] = [];
    for (let v = 0; v < p.length; v += 3) verts.push(`<vertex x="${fmt(p[v])}" y="${fmt(p[v + 1])}" z="${fmt(p[v + 2])}"/>`);
    const tris: string[] = [];
    for (let t = 0; t < idx.length; t += 3) tris.push(`<triangle v1="${idx[t]}" v2="${idx[t + 1]}" v3="${idx[t + 2]}"/>`);
    files[path.slice(1)] = strToU8(
      `${header()} <resources>\n  <object id="${innerId}" p:UUID="${uuid(n, 1)}" type="model">\n   <mesh>\n    <vertices>${verts.join('')}</vertices>\n    <triangles>${tris.join('')}</triangles>\n   </mesh>\n  </object>\n </resources>\n <build/>\n</model>\n`,
    );
    rels.push(` <Relationship Target="${path}" Id="rel-${n}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`);
    objectXml.push(
      `  <object id="${outerId}" name="${esc(o.name)}" p:UUID="${uuid(n, 2)}" type="model">\n   <components>\n    <component p:path="${path}" objectid="${innerId}" p:UUID="${uuid(n, 3)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n   </components>\n  </object>`,
    );
    const [tx, ty, tz] = placements[i];
    items.push(
      `  <item objectid="${outerId}" p:UUID="${uuid(n, 4)}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx + ox)} ${fmt(ty + oy)} ${fmt(tz)}" printable="1"/>`,
    );
    const name = esc(o.name);
    configObjects.push(
      `  <object id="${outerId}">\n    <metadata key="name" value="${name}"/>\n    <metadata key="extruder" value="${filamentOf[i]}"/>\n    <part id="${innerId}" subtype="normal_part">\n      <metadata key="name" value="${name}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="${filamentOf[i]}"/>\n    </part>\n  </object>`,
    );
    instances.push(
      `    <model_instance>\n      <metadata key="object_id" value="${outerId}"/>\n      <metadata key="instance_id" value="0"/>\n    </model_instance>`,
    );
  });

  const title = esc(opts.title ?? '3dsplit');
  files['3D/3dmodel.model'] = strToU8(
    `${header(` <metadata name="Application">3dsplit</metadata>\n <metadata name="Title">${title}</metadata>\n`)} <resources>\n${objectXml.join('\n')}\n </resources>\n <build p:UUID="${uuid(0, 5)}">\n${items.join('\n')}\n </build>\n</model>\n`,
  );
  files['3D/_rels/3dmodel.model.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${rels.join('\n')}\n</Relationships>\n`,
  );
  files['Metadata/model_settings.config'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${configObjects.join('\n')}\n  <plate>\n    <metadata key="plater_id" value="1"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n${instances.join('\n')}\n  </plate>\n</config>\n`,
  );
  files['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="png" ContentType="image/png"/>\n</Types>\n`,
  );
  files['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`,
  );
  return zipSync(files);
}

/** Filament sırası: parçaların renkleri ilk görüldükleri sırayla (filament 1, 2, ...). */
export function filamentColors(objects: ExportObject[]): string[] {
  const colors: string[] = [];
  for (const o of objects) {
    const c = o.color.toUpperCase();
    if (!colors.includes(c)) colors.push(c);
  }
  return colors;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(5);
}
