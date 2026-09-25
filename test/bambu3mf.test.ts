import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { boundingBox } from '../src/core/geometry';
import { write3mfBambu } from '../src/io/bambu3mf';
import { parse3mf } from '../src/io/threeMf';
import { subdividedCube } from './fixtures';

describe('Bambu 3MF', () => {
  const cube = subdividedCube(20, 1);
  const files = unzipSync(
    write3mfBambu([
      { name: 'gövde', mesh: cube, color: '#b0b0b0' },
      { name: 'göz', mesh: cube, color: '#3498db' },
      { name: 'diğer göz', mesh: cube, color: '#3498DB' },
    ]),
  );
  const text = (p: string) => strFromU8(files[p]);

  it('Bambu proje yapısını yazar', () => {
    for (const p of [
      '3D/3dmodel.model',
      '3D/_rels/3dmodel.model.rels',
      '3D/Objects/object_1.model',
      '3D/Objects/object_3.model',
      'Metadata/model_settings.config',
      '[Content_Types].xml',
      '_rels/.rels',
    ]) {
      expect(files[p], p).toBeDefined();
    }
    expect(text('3D/3dmodel.model')).toContain('<metadata name="Application">3dsplit</metadata>');
    // eksik ön ayarlı Bambu projesi Bambu Studio'yu çökertiyor: yazılmamalı
    expect(files['Metadata/project_settings.config']).toBeUndefined();
  });

  it('aynı renk aynı filament', () => {
    const cfg = text('Metadata/model_settings.config');
    const extruders = [
      ...cfg.matchAll(/<object id="\d+">[\s\S]*?key="extruder" value="(\d+)"/g),
    ].map((m) => Number(m[1]));
    expect(extruders).toEqual([1, 2, 2]);
  });

  it('alt dosyalardaki nesne kimlikleri benzersiz (Bambu aynı kimliği tek mesh sanıyor)', () => {
    const ids = [1, 2, 3].map(
      (n) => text(`3D/Objects/object_${n}.model`).match(/<object id="(\d+)"/)?.[1],
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('parçaları plakaya taban z=0 olacak şekilde, üst üste binmeden dizer', () => {
    const items = [...text('3D/3dmodel.model').matchAll(/<item [^>]*transform="([^"]+)"/g)].map(
      (m) => m[1].split(' ').map(Number),
    );
    expect(items.length).toBe(3);
    const xs = items.map((t) => t[9]);
    for (const t of items) expect(t[11]).toBeCloseTo(10, 5); // küp -10..10: taban 0'a
    // küp 20 mm + 5 mm boşluk
    expect(xs[1] - xs[0]).toBeCloseTo(25, 5);
    expect(xs[2] - xs[1]).toBeCloseTo(25, 5);
  });

  it('X46: döndürülen parça geri okununca plakada, tabanı z=0 ve dar kenarı Y boyunca', () => {
    // 40x4 mm çubuk, XY'de 45° çapraz
    const bar = subdividedCube(1, 1);
    const p = Float32Array.from(bar.positions);
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] * 40;
      const y = p[i + 1] * 4;
      p[i] = (x - y) / Math.SQRT2;
      p[i + 1] = (x + y) / Math.SQRT2;
      p[i + 2] += 7;
    }
    const f = parse3mf(
      write3mfBambu([
        { name: 'çubuk', mesh: { positions: p, indices: bar.indices }, color: '#ff0000' },
      ]),
    );
    const b = boundingBox(f.objects[0].positions);
    expect(b.min[2]).toBeCloseTo(0, 4);
    expect(b.max[0] - b.min[0]).toBeCloseTo(40, 2);
    expect(b.max[1] - b.min[1]).toBeCloseTo(4, 2);
    expect(b.min[0]).toBeGreaterThan(0);
    expect(b.max[0]).toBeLessThan(256);
  });
});
