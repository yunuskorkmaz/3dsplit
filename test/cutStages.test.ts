import { describe, expect, it } from 'vitest';
import {
  cutStages,
  pushSpeed,
  remainingSeconds,
  SPEED_HISTORY,
  stageProgress,
} from '../src/core/cutStages';

describe('X127: kesim aşamaları', () => {
  it('kesim türü başına sabit liste', () => {
    const base = { smoothEdge: true, planar: false, seam: false };
    expect(cutStages('socket', base)).toEqual([
      'Kesim kenarı düzeltiliyor',
      'Model kuruluyor',
      'Seçim bölgeleri bulunuyor',
      'Tapa ve yuva hacmi kuruluyor',
    ]);
    expect(cutStages('keys', base)).toEqual([
      'Kesim kenarı düzeltiliyor',
      'Model kuruluyor',
      'Seçim bölgeleri bulunuyor',
      'Kesim yüzü kapatılıyor',
      'Pimler ve delikler ekleniyor',
      'Gövdeler hazırlanıyor',
    ]);
    expect(cutStages('fast', { ...base, smoothEdge: false, planar: true })).toEqual([
      'Model kuruluyor',
      'Seçim bölgeleri bulunuyor',
      'Düzlemle ayrılıyor',
      'Gövdeler hazırlanıyor',
    ]);
    expect(cutStages('keys', { ...base, seam: true })).toEqual(['Model kuruluyor']);
  });

  it('aşamanın sırası', () => {
    const list = cutStages('keys', { smoothEdge: false, planar: false, seam: false });
    expect(stageProgress(list, 'Pimler ve delikler ekleniyor')).toEqual({ index: 4, total: 5 });
    expect(stageProgress(list, 'bilinmeyen')).toBeNull();
    expect(stageProgress(list, null)).toBeNull();
  });
});

describe('X127: kalan süre tahmini', () => {
  it('geçmiş yoksa ya da 5 s dolmadıysa yok', () => {
    expect(remainingSeconds(100_000, [], 9000)).toBeNull();
    expect(remainingSeconds(100_000, [10_000], 4000)).toBeNull();
  });

  it('ortanca hızla kalan süre', () => {
    // 100 bin üçgen, ortanca 10 bin üçgen/s: 10 s; 6 s geçti, 4 s kaldı
    expect(remainingSeconds(100_000, [5_000, 10_000, 50_000], 6000)).toBe(4);
    // çift sayıda: ortadaki ikisinin ortalaması (10 bin)
    expect(remainingSeconds(100_000, [5_000, 8_000, 12_000, 50_000], 6000)).toBe(4);
  });

  it('tahmin aşıldıysa yok', () => {
    expect(remainingSeconds(100_000, [10_000], 12_000)).toBeNull();
  });

  it('geçmiş en çok 5 hız tutar', () => {
    let s: number[] = [];
    for (let i = 1; i <= 7; i++) s = pushSpeed(s, i);
    expect(s).toEqual([3, 4, 5, 6, 7]);
    expect(s.length).toBe(SPEED_HISTORY);
  });
});
