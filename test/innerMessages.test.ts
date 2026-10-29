import { describe, expect, it } from 'vitest';
import { innerMessages } from '../src/state/innerMessages';

const slots = [
  { id: 0, name: 'Taban' },
  { id: 4, name: 'Filament 4' },
  { id: 3, name: 'Filament 3' },
];

describe('X113: bölge içindeki renk iletisi', () => {
  it('başka rengi adıyla, boyasız alanı sayısıyla söyler; kırıntıyı atlar', () => {
    const inner = [
      { slot: 4, tris: 3753, regions: 1, area: 40 },
      { slot: 0, tris: 12, regions: 2, area: 0.5 },
      { slot: 3, tris: 1, regions: 1, area: 0.2 },
    ];
    expect(innerMessages(inner, slots, 'socket', true)).toEqual([
      'Bölgenin içinde Filament 4 var (3.753 üçgen); tapaya katıldı. Ayrı basmak için kesimden sonra tapayı seçip Filament 4 setini kes.',
      'Bölgenin içindeki 2 boyasız alan tapaya katıldı.',
    ]);
    expect(innerMessages(inner.slice(1, 2), slots, 'keys', false)).toEqual([
      'Bölgenin içindeki 2 boyasız alan kesilen parçaya katılacak.',
    ]);
  });
});
