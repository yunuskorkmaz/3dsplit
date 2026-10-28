import { describe, expect, it } from 'vitest';
import { filamentReport, hiddenBodies, uncutColors } from '../src/state/exportReport';

const part = (id: string, labels: number[], over: Partial<Record<string, unknown>> = {}) => ({
  id,
  name: id,
  visible: true,
  badge: null as string | null,
  colorSlot: 0,
  mesh: { labels: Uint16Array.from(labels) },
  ...over,
});
const slots = [
  { id: 0, name: 'Taban', color: '#b0b0b0' },
  { id: 1, name: 'Filament 1', color: '#ffffff', filament: 1 },
  { id: 2, name: 'Filament 2', color: '#123456', filament: 2 },
  { id: 3, name: 'Göz', color: '#FFFFFF' },
];

describe('X110: dışa aktarma raporu', () => {
  it('görünen gövdede kesilmemiş renkleri bulur, gövdenin kendi rengini saymaz', () => {
    const parts = [
      // gövde Filament 1: 1 ve aynı renkteki 3 kaybolmaz, 2 kaybolur
      part('gövde', [0, 1, 2, 2, 3], { colorSlot: 1 }),
      part('temiz', [0, 0]),
      part('gizli', [2], { visible: false }),
      part('kaynak', [2], { badge: 'source' }),
    ];
    expect(uncutColors(parts, slots)).toEqual([{ partId: 'gövde', partName: 'gövde', slots: [2] }]);
    expect(hiddenBodies(parts)).toBe(1);
  });

  it('filament eşlemesi numaraya göre, set adı ve gövde adlarıyla', () => {
    const objs = [
      { name: 'Bluey', color: '#b0b0b0' },
      { name: 'Gövde 3', color: '#ffffff' },
      { name: 'Gövde 4', color: '#FFFFFF' },
    ];
    expect(filamentReport(objs, [2, 1, 1], slots)).toEqual([
      { filament: 1, color: '#ffffff', setName: 'Filament 1', parts: ['Gövde 3', 'Gövde 4'] },
      { filament: 2, color: '#b0b0b0', setName: 'Taban', parts: ['Bluey'] },
    ]);
  });
});
