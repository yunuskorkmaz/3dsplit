import type { PinPlacement } from '../core/cut';
import { suggestFeatures } from '../core/paint';
import { BASE_SLOT, type Vec3 } from '../core/types';
import { geometry } from '../worker/client';
import { cutOptions } from './actionsCut';
import { applyLabels, beginStroke, endStroke } from './actionsPaint';
import { get, nextSlotColor, notify, pushHistory, selectedPart, set, useStore } from './store';
import { concavityOf, topologyOf } from './topologyCache';

// ---------- pimler ----------

let layoutSeq = 0;

let layoutTimer: ReturnType<typeof setTimeout> | null = null;

/** Pimlerin gerçek yerleşimini (otomatik boyut/yer dahil) worker'dan alır. */
async function refreshPinLayout(): Promise<void> {
  const seq = ++layoutSeq;
  const { cut, tool, previewActive, activeSlot } = get();
  const part = selectedPart();
  if (
    cut.mode !== 'keys' ||
    (tool !== 'pin' && !previewActive) ||
    !part ||
    activeSlot === BASE_SLOT
  ) {
    if (get().pinLayout.length) set({ pinLayout: [] });
    return;
  }
  const layout = await geometry.pinLayout(part.mesh, cutOptions());
  if (seq === layoutSeq) set({ pinLayout: layout });
}

useStore.subscribe((s, prev) => {
  if (
    s.cut === prev.cut &&
    s.pins === prev.pins &&
    s.tool === prev.tool &&
    s.previewActive === prev.previewActive &&
    s.activeSlot === prev.activeSlot &&
    s.selectedPartId === prev.selectedPartId &&
    s.paintVersion === prev.paintVersion &&
    s.parts === prev.parts
  )
    return;
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    layoutTimer = null;
    refreshPinLayout();
  }, 80);
});

/**
 * Pim aracında tıklama. Bir pimin üstüne (ekranda) tıklanırsa seçilir; pimler
 * otomatikse önce bulundukları yerde elle pime çevrilir. Shift+tık pimi siler.
 * Pim seçiliyken boşluğa tıklamak seçimi bırakır; seçili pim yokken yeni pim ekler.
 * Pime tıklandıysa sürüklemeyle yüzeyde taşımak için pim numarasını döndürür.
 */
export function pinClick(index: number, point: Vec3, shift: boolean): number {
  const { pins, pinLayout: layout, selectedPin } = get();
  if (index >= 0) {
    if (!pins.length) {
      // otomatik pimler: yerlerinde elle pime dönüşür (boyut otomatik kalır)
      const manual = layout.map((l) => ({ point: l.surface }));
      if (shift) {
        commitPins(
          manual.filter((_, i) => i !== index),
          'Pim sil',
          -1,
        );
        return -1;
      }
      commitPins(manual, 'Pimleri elle düzenle', index);
      return index;
    }
    if (shift) {
      removePin(index);
      return -1;
    }
    set({ selectedPin: index });
    return index;
  }
  if (shift) return -1;
  if (selectedPin >= 0) {
    set({ selectedPin: -1 });
    return -1;
  }
  commitPins([...pins, { point }], 'Pim ekle', pins.length);
  return -1;
}

/** Tutamakla taşıma/döndürme bitti: seçili pime yeni yer ve eksen yazılır. */
export function commitPinHandle(point: Vec3, axis: Vec3): void {
  const i = get().selectedPin;
  if (i < 0) return;
  const mode = get().pinGizmo;
  updatePin(
    i,
    mode === 'translate' ? { point } : { axis },
    mode === 'translate' ? 'Pim taşı' : 'Pim döndür',
  );
}

/**
 * Pim listesini değiştirir ve geçmişe yazar. Aynı adlı değişiklikler art
 * arda (1 s içinde) gelirse tek adımda birleşir: sürükleme ya da sayı
 * alanında kaydırma geçmişi yüzlerce adımla doldurmaz.
 */
export function commitPins(next: PinPlacement[], label: string, selected?: number): void {
  const { pins: before, undoStack, redoStack } = get();
  if (next === before) return;
  set(selected === undefined ? { pins: next } : { pins: next, selectedPin: selected });
  const last = undoStack[undoStack.length - 1];
  const now = Date.now();
  if (
    last?.kind === 'pins' &&
    last.label === label &&
    !redoStack.length &&
    now - (last.time ?? 0) < 1000
  ) {
    const merged = { ...last, after: next, time: now };
    set({ undoStack: [...undoStack.slice(0, -1), merged] });
    return;
  }
  pushHistory({ kind: 'pins', before, after: next, time: now }, label);
}

export function updatePin(index: number, patch: Partial<PinPlacement>, label = 'Pim ayarı'): void {
  commitPins(
    get().pins.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    label,
  );
}

export function removePin(index: number): void {
  commitPins(
    get().pins.filter((_, i) => i !== index),
    'Pim sil',
    -1,
  );
}

/** Elle konan pimleri siler, otomatik yerleşime döner. */
export function clearPins(): void {
  if (get().pins.length) commitPins([], 'Otomatiğe dön', -1);
}

// ---------- otomatik öneri (B9) ----------

/**
 * Seçili parçadaki çıkıntıları (göz, burun, kaş, kulak…) bulup her birini yeni
 * bir slota boyar. Büyükten küçüğe boyanır; iç içe olanlarda (ağız çevresi ve
 * burun) küçük olan üstte kalır. Önceden boyanmış yerlere dokunulmaz. Tek geri alma.
 */
export function autoSuggestFeatures(): void {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  const topo = topologyOf(part.mesh);
  const concavity = concavityOf(part.mesh, topo.meanEdge * 3);
  const found = suggestFeatures(topo.adj, topo.normals, topo.centroids, topo.areas, concavity, {
    meanEdge: topo.meanEdge,
    maxSeeds: 40,
    spacing: Math.max(2, topo.meanEdge * 10),
    areaRange: [0.0005, 0.15],
  });
  if (!found.length) return notify('info', 'Belirgin çıkıntı bulunamadı.');
  const slots = [...get().slots];
  let nextId = Math.max(...slots.map((s) => s.id)) + 1;
  const labels = part.mesh.labels;
  const ours = new Set<number>();
  beginStroke(part.id, 'Çıkıntıları öner');
  for (const tris of found) {
    const id = nextId++;
    slots.push({ id, name: `Öneri ${ours.size + 1}`, color: nextSlotColor(id) });
    ours.add(id);
    const free = Array.from(tris).filter((t) => labels[t] === BASE_SLOT || ours.has(labels[t]));
    applyLabels(part, free, id);
  }
  endStroke();
  set({ slots });
  notify(
    'info',
    `${found.length} çıkıntı önerildi. "temizle" boyayı siler, "kaldır" rengi listeden çıkarır.`,
  );
}
