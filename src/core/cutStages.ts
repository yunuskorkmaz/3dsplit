import type { CutMode } from './cut';

/**
 * X127: kesim türü başına aşama listesi; worker'ın `stage()` ile bildirdiği adlar
 * bu sırayla gelir (geometry.worker.ts, cutRun.ts).
 */
export function cutStages(
  mode: CutMode,
  opts: { smoothEdge: boolean; planar: boolean; seam: boolean },
): string[] {
  const list = opts.smoothEdge && !opts.seam ? ['Kesim kenarı düzeltiliyor'] : [];
  list.push('Model kuruluyor');
  if (opts.seam) return list;
  list.push('Seçim bölgeleri bulunuyor');
  if (mode === 'socket') return [...list, 'Tapa ve yuva hacmi kuruluyor'];
  list.push(opts.planar ? 'Düzlemle ayrılıyor' : 'Kesim yüzü kapatılıyor');
  if (mode === 'keys') list.push('Pimler ve delikler ekleniyor');
  list.push('Gövdeler hazırlanıyor');
  return list;
}

/** Aşamanın sırası (1'den) ve toplam; listede yoksa null. */
export function stageProgress(
  stages: string[],
  stage: string | null,
): { index: number; total: number } | null {
  const i = stage ? stages.indexOf(stage) : -1;
  return i < 0 ? null : { index: i + 1, total: stages.length };
}

/** Tahmin için saklanan son kesim hızları (üçgen/s), tür başına en çok bu kadar. */
export const SPEED_HISTORY = 5;

/** Tahmin bu süreyi geçen işte gösterilir, ms. */
export const ESTIMATE_AFTER = 5000;

/**
 * X127: aynı türden son kesimlerin hızına (üçgen/s, ortanca) göre kalan süre, s.
 * Geçmiş yoksa, iş henüz `ESTIMATE_AFTER`'ı geçmediyse ya da tahmin aşıldıysa null.
 */
export function remainingSeconds(
  triangles: number,
  speeds: readonly number[],
  elapsedMs: number,
): number | null {
  if (!speeds.length || elapsedMs < ESTIMATE_AFTER) return null;
  const sorted = [...speeds].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const speed = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (!(speed > 0)) return null;
  const left = triangles / speed - elapsedMs / 1000;
  return left >= 1 ? Math.round(left) : null;
}

/** Yeni hızı geçmişe ekler; en eski düşer. */
export function pushSpeed(speeds: readonly number[], speed: number): number[] {
  return [...speeds, speed].slice(-SPEED_HISTORY);
}
