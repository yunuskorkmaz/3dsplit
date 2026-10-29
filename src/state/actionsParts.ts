import { formatNumber } from '../core/format';
import { largestExtent, scaleMeshes } from '../core/geometry';
import { get, notify, type Part, pushHistory, set } from './store';

// ---------- parça yönetimi ----------

export function selectPart(id: string): void {
  set({ selectedPartId: id });
}

export function toggleVisible(id: string): void {
  set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)) }));
}

/** X27: yalnız bu parça görünsün; zaten yalnızsa kaynak dışındaki tüm parçalar geri gelir. */
export function soloPart(id: string): void {
  const parts = get().parts;
  const alone = parts.every((p) => p.visible === (p.id === id));
  if (alone) {
    set({ parts: parts.map((p) => ({ ...p, visible: p.badge !== 'source' || p.id === id })) });
    return;
  }
  set({
    parts: parts.map((p) => ({ ...p, visible: p.id === id })),
    selectedPartId: id,
  });
}

/** Kesimden önceki kaynak parçalar hariç hepsini gösterir (kaynak yalnızsa o da gösterilir). */
export function showAllParts(): void {
  const parts = get().parts;
  const onlySources = parts.every((p) => p.badge === 'source');
  set({ parts: parts.map((p) => ({ ...p, visible: onlySources || p.badge !== 'source' })) });
}

export function hideSelectedPart(): void {
  const id = get().selectedPartId;
  if (id)
    set((s) => ({
      parts: s.parts.map((p) => (p.id === id ? { ...p, visible: false } : p)),
    }));
}

export function toggleExplode(): void {
  set((s) => ({ explode: s.explode > 0 ? 0 : 0.6 }));
}

export function deletePart(id: string): void {
  const before = get().parts;
  const after = before.filter((p) => p.id !== id);
  set((s) => ({
    parts: after,
    selectedPartId: s.selectedPartId === id ? (after[0]?.id ?? null) : s.selectedPartId,
  }));
  pushHistory({ kind: 'parts', before, after }, 'Parça sil');
}

export function renamePart(id: string, name: string): void {
  set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, name } : p)) }));
}

/** X71: ölçülen parçalar; kaynaklar kesimden önceki hal olduğu için sayılmaz (hepsi kaynaksa onlar). */
function measuredParts(parts: Part[]): Part[] {
  const live = parts.filter((p) => p.badge !== 'source');
  return live.length ? live : parts;
}

/**
 * X71/X80: modelin ölçüsü, mm: en büyük parçanın en uzun kenarı. Plakaya dağılmış
 * parçaların aralıkları sayılmaz. Parça yoksa 0.
 */
export function modelExtent(parts: Part[]): number {
  return parts.length ? largestExtent(measuredParts(parts).map((p) => p.mesh)) : 0;
}

/** X71: bütün parçaları birlikte ölçekler; en büyük parçanın en uzun kenarı `target` mm olur. Geri alınabilir. */
export function scaleToPrintSize(target: number): void {
  const before = get().parts;
  const extent = modelExtent(before);
  if (!(extent > 0) || !(target > 0)) return;
  const factor = target / extent;
  if (Math.abs(factor - 1) < 1e-6) return;
  const meshes = scaleMeshes(
    before.map((p) => p.mesh),
    factor,
  );
  const after = before.map((p, i) => ({ ...p, mesh: meshes[i] }));
  // pim ve önizleme eski ölçüde: sıfırlanır
  set({
    parts: after,
    preview: null,
    previewActive: false,
    pins: [],
    selectedPin: -1,
    suggestion: null,
    smartAutoScale: 0,
  });
  pushHistory({ kind: 'parts', before, after }, `Baskı boyu ${formatNumber(target)} mm`);
  notify(
    'info',
    `${before.length > 1 ? 'En büyük parça' : 'Model'} ${formatNumber(extent)} mm → ${formatNumber(target)} mm ölçeklendi (×${formatNumber(factor, 3)}).`,
  );
}
