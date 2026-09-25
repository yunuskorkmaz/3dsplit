import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { write3mfBambu } from '../src/io/bambu3mf';
import { decodePaint, parse3mf } from '../src/io/threeMf';
import { subdividedCube } from './fixtures';

describe('3MF boya kodu', () => {
  it('yaprak durumları', () => {
    expect(decodePaint('4')).toBe(1);
    expect(decodePaint('8')).toBe(2);
    expect(decodePaint('0C')).toBe(3);
    expect(decodePaint('1C')).toBe(4);
  });
  it('alt bölmeli üçgende baskın renk', () => {
    // 3 çocuk: 1, 1, 2 -> 1
    expect(decodePaint('8442')).toBe(1);
    // 3 çocuk: 2, 2, 1 -> 2
    expect(decodePaint('4882')).toBe(2);
  });
});

describe('3MF okuma', () => {
  it('kendi Bambu çıktımızı geri okur (bileşenler, dönüşüm)', () => {
    const cube = subdividedCube(20, 2);
    const file = parse3mf(
      write3mfBambu([
        { name: 'a', mesh: cube, color: '#ff0000' },
        { name: 'b', mesh: cube, color: '#00ff00' },
      ]),
    );
    expect(file.objects.map((o) => o.name)).toEqual(['a', 'b']);
    expect(file.objects[0].indices.length).toBe(cube.indices.length);
    // taban z=0'a oturtulmuş
    const zs = Array.from(file.objects[0].positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(0, 4);
  });

  it('boyalı üçgenleri ve filament renklerini okur', () => {
    const model = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" name="boyalı" type="model"><mesh>
   <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices>
   <triangles><triangle v1="0" v2="2" v3="1" paint_color="8"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2" paint_color="4"/><triangle v1="1" v2="2" v3="3" paint_color="0C"/></triangles>
  </mesh></object>
 </resources>
 <build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></build>
</model>`;
    const file = parse3mf(
      zipSync({
        '3D/3dmodel.model': strToU8(model),
        'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#111111', '#222222', '#333333'] })),
      }),
    );
    expect(Array.from(file.objects[0].paint ?? [])).toEqual([2, 0, 1, 3]);
    expect(file.filamentColors).toEqual(['#111111', '#222222', '#333333']);
    expect(file.objects[0].positions[0]).toBe(10);
  });
});
