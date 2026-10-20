import { get, pushHistory, set } from './store';

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
