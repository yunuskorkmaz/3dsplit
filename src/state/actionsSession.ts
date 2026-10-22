import {
  clearSession,
  loadSession,
  loadSessionMeta,
  type SessionData,
  saveSession,
} from '../io/session';
import { clearPaintSession } from './actionsPaint';
import { type AppState, get, notify, reservePartIds, set, useStore } from './store';

/** Son değişiklikten bu kadar sonra yazılır, ms. */
const SAVE_DELAY = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let pending = false;
/** Bu oturumda model açıldı mı: açılmadıysa boş sahne eski kaydı silmez. */
let hadParts = false;

function snapshot(s: AppState): SessionData {
  return {
    parts: s.parts.map((p) => ({
      id: p.id,
      name: p.name,
      visible: p.visible,
      badge: p.badge,
      colorSlot: p.colorSlot,
      manifold: p.manifold,
      origin: p.origin,
      mesh: p.mesh,
    })),
    slots: s.slots,
    activeSlot: s.activeSlot,
    selectedPartId: s.selectedPartId,
    cut: s.cut,
    pins: s.pins,
  };
}

async function write(): Promise<void> {
  timer = null;
  if (writing) {
    pending = true;
    return;
  }
  const s = get();
  // ağır iş ya da fırça darbesi sürerken bekle: yarım durum yazılmasın
  if (s.busy) return schedule();
  writing = true;
  set((st) => ({ session: { ...st.session, saving: true } }));
  try {
    if (!s.parts.length) {
      await clearSession();
      set((st) => ({ session: { ...st.session, saving: false, savedAt: null } }));
    } else {
      const name = s.parts.find((p) => p.badge !== 'source')?.name ?? 'oturum';
      const bodies = s.parts.filter((p) => p.badge !== 'source').length;
      const savedAt = Date.now();
      await saveSession({ name, bodies, savedAt }, snapshot(s));
      set((st) => ({ session: { ...st.session, saving: false, savedAt } }));
    }
  } catch (e) {
    set((st) => ({ session: { ...st.session, saving: false } }));
    notify('warn', `Oturum tarayıcıya kaydedilemedi: ${e instanceof Error ? e.message : e}`);
  } finally {
    writing = false;
    if (pending) {
      pending = false;
      schedule();
    }
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(write, SAVE_DELAY);
}

/**
 * X95: değişiklikleri izler, durunca oturumu yazar. Açılışta kayıtlı oturum varsa
 * boş sahnede önerilir (`session.offer`).
 */
export function startSessionAutosave(): () => void {
  loadSessionMeta().then((meta) => {
    if (meta && !get().parts.length) set((s) => ({ session: { ...s.session, offer: meta } }));
  });
  return useStore.subscribe((s, prev) => {
    const changed =
      s.parts !== prev.parts ||
      s.paintVersion !== prev.paintVersion ||
      s.slots !== prev.slots ||
      s.activeSlot !== prev.activeSlot ||
      s.selectedPartId !== prev.selectedPartId ||
      s.cut !== prev.cut ||
      s.pins !== prev.pins;
    if (!changed) return;
    if (s.parts.length) {
      hadParts = true;
      // yeni model açıldı: eski kayıt önerisi kalkar, yerine bu yazılır
      if (s.session.offer) set((st) => ({ session: { ...st.session, offer: null } }));
    }
    if (hadParts) schedule();
  });
}

export async function restoreSession(): Promise<void> {
  const data = await loadSession();
  if (!data?.parts.length) {
    set((s) => ({ session: { ...s.session, offer: null } }));
    notify('warn', 'Kayıtlı oturum okunamadı.');
    return;
  }
  reservePartIds(data.parts.map((p) => p.id));
  clearPaintSession();
  set((s) => ({
    parts: data.parts,
    slots: data.slots,
    activeSlot: data.activeSlot,
    selectedPartId: data.selectedPartId,
    cut: { ...s.cut, ...(data.cut as object) },
    pins: Array.isArray(data.pins) ? data.pins : [],
    selectedPin: -1,
    preview: null,
    previewActive: false,
    undoStack: [],
    redoStack: [],
    session: { ...s.session, offer: null },
  }));
  notify(
    'info',
    `Oturum kurtarıldı: ${data.parts.filter((p) => p.badge !== 'source').length} gövde.`,
  );
}

export async function discardSession(): Promise<void> {
  set((s) => ({ session: { ...s.session, offer: null } }));
  await clearSession();
}
