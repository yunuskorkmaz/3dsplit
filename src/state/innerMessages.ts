import type { CutMode } from '../core/cut';
import type { InnerPaint } from '../core/cutTypes';
import { BASE_SLOT } from '../core/types';

/**
 * X113: bölgenin içinde kalıp kesilen parçaya katılan renkler için ileti.
 * `done` kesimden sonra (katıldı), değilse önizlemede (katılacak).
 */
export function innerMessages(
  inner: InnerPaint[] | undefined,
  slots: { id: number; name: string }[],
  mode: CutMode,
  done: boolean,
): string[] {
  const piece = mode === 'socket' ? 'tapa' : 'kesilen parça';
  // tapa/parça ikisi de -ya, -yı ekini alır
  const joined = `${piece}ya ${done ? 'katıldı' : 'katılacak'}`;
  // başka rengin 1 mm²'den küçük kırıntısı ileti değil (kesimdeki kırıntı eşiği)
  const shown = (inner ?? []).filter((p) => p.slot === BASE_SLOT || p.area >= 1);
  return shown.map((p) => {
    if (p.slot === BASE_SLOT) return `Bölgenin içindeki ${p.regions} boyasız alan ${joined}.`;
    const name = slots.find((s) => s.id === p.slot)?.name ?? `Slot ${p.slot}`;
    return `Bölgenin içinde ${name} var (${p.tris.toLocaleString('tr-TR')} üçgen); ${joined}. Ayrı basmak için kesimden sonra ${piece}yı seçip ${name} setini kes.`;
  });
}
