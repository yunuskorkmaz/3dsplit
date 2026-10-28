import { applySplit, revertSplit } from '../core/smooth';
import { BASE_SLOT } from '../core/types';
import { bumpGeometry, onGeometryChanged, onLabelsChanged } from './actionsHooks';
import { clearLastSmart } from './actionsPaint';
import { replaceMeshArrays } from './actionsSmooth';
import { get, type HistoryEntry, set } from './store';
import { refreshGeometry } from './topologyCache';

// ---------- geri al / yinele ----------

function applyEntry(entry: HistoryEntry, reverse: boolean): void {
  if (entry.kind === 'paint') {
    const values = reverse ? entry.before : entry.after;
    for (let i = 0; i < entry.tris.length; i++) entry.mesh.labels[entry.tris[i]] = values[i];
    const part = get().parts.find((p) => p.mesh === entry.mesh);
    if (part) onLabelsChanged?.(part.id, entry.tris);
    set((s) => ({ paintVersion: s.paintVersion + 1 }));
  } else if (entry.kind === 'pins') {
    // X105: pim değişikliği kendi bölgesinde geri alınır
    const target =
      entry.slot === undefined
        ? {}
        : { selectedPartId: entry.partId ?? null, activeSlot: entry.slot };
    set({ ...target, pins: reverse ? entry.before : entry.after, selectedPin: -1 });
  } else if (entry.kind === 'split') {
    if (reverse) replaceMeshArrays(entry.mesh, revertSplit(entry.mesh, entry.diff));
    else replaceMeshArrays(entry.mesh, applySplit(entry.mesh, entry.diff), entry.diff);
  } else if (entry.kind === 'removeSlot') {
    const slots = reverse ? entry.beforeSlots : entry.afterSlots;
    const activeSlot = reverse ? entry.activeBefore : entry.activeAfter;
    for (const paint of entry.paints) {
      const value = reverse ? entry.slotId : BASE_SLOT;
      for (const t of paint.tris) paint.mesh.labels[t] = value;
      const part = get().parts.find((p) => p.mesh === paint.mesh);
      if (part) onLabelsChanged?.(part.id, [...paint.tris]);
    }
    set((s) => ({
      slots,
      activeSlot,
      paintVersion: s.paintVersion + 1,
      parts: s.parts.map((p) => {
        const prev = entry.colorBefore.find((c) => c.id === p.id);
        if (!prev) return p;
        return { ...p, colorSlot: reverse ? prev.colorSlot : BASE_SLOT };
      }),
    }));
  } else if (entry.kind === 'geometry') {
    const pos = reverse ? entry.posBefore : entry.posAfter;
    const lab = reverse ? entry.labelsBefore : entry.labelsAfter;
    entry.verts.forEach((v, i) => {
      entry.mesh.positions.set(pos.subarray(3 * i, 3 * i + 3), 3 * v);
    });
    if (entry.verts.length) bumpGeometry(entry.mesh);
    entry.tris.forEach((t, i) => {
      entry.mesh.labels[t] = lab[i];
    });
    refreshGeometry(entry.mesh);
    const part = get().parts.find((p) => p.mesh === entry.mesh);
    if (part) {
      // köşesi değişen üçgenler de yeniden yazılır
      const touched = new Set<number>(entry.tris);
      const moved = new Set<number>(entry.verts);
      const idx = entry.mesh.indices;
      for (let t = 0; t < idx.length / 3; t++) {
        if (moved.has(idx[3 * t]) || moved.has(idx[3 * t + 1]) || moved.has(idx[3 * t + 2]))
          touched.add(t);
      }
      onGeometryChanged?.(part.id, [...touched]);
      onGeometryChanged?.(part.id, null);
    }
    set((s) => ({ paintVersion: s.paintVersion + 1 }));
  } else {
    const parts = reverse ? entry.before : entry.after;
    // X105: kesim geri alınınca kesilen bölgenin pimleri, yönü ve derinlikleri de döner
    const region = entry.region && (reverse ? entry.region.before : entry.region.after);
    set((s) => {
      const keep = region?.partId ?? s.selectedPartId;
      return {
        parts,
        selectedPartId: parts.some((p) => p.id === keep) ? keep : (parts[0]?.id ?? null),
        ...(region && {
          activeSlot: region.slot,
          pins: region.pins,
          selectedPin: -1,
          cut: {
            ...s.cut,
            direction: region.direction,
            islandDepths: region.islandDepths,
            ringProfile: region.ringProfile,
          },
        }),
      };
    });
  }
}

/** Geçmişte `undoCount` kayıt uygulanmış duruma gider (geri al / yinele tekrarı). */
export function jumpToHistory(undoCount: number): void {
  while (get().undoStack.length > undoCount) undo();
  while (get().undoStack.length < undoCount && get().redoStack.length) redo();
}

export function undo(): void {
  const stack = get().undoStack;
  const entry = stack[stack.length - 1];
  if (!entry) return;
  clearLastSmart();
  set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] }));
  applyEntry(entry, true);
}

export function redo(): void {
  const stack = get().redoStack;
  const entry = stack[stack.length - 1];
  if (!entry) return;
  set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, entry] }));
  applyEntry(entry, false);
}
