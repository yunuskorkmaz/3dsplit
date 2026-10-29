import {
  loadSession,
  loadSessionMeta,
  type SessionData,
  type SessionSlot,
  saveSession,
} from '../io/session';
import { closeCoupon } from './actionsCoupon';
import { clearPaintSession } from './actionsPaint';
import { type AppState, get, notify, reservePartIds, set, useStore } from './store';

/** Son değişiklikten bu kadar sonra yazılır, ms. */
const SAVE_DELAY = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let pending = false;
/** X106: bu sahnenin oturum kimliği; yeni model ya da proje açılınca yenilenir. */
let sessionId = newSessionId();

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * X106: boş sahneye model ya da proje açıldı: yeni oturum başlar. Kayıttaki eski
 * oturum ilk yazmada "Önceki oturum" olur. `replaced`: dolu sahne ya da önerilen kayıt değişti.
 */
export function startNewSession(replaced = false): void {
  sessionId = newSessionId();
  if (replaced)
    notify('info', 'Önceki çalışma saklandı: Komut ara › "Önceki oturumu aç" geri getirir.');
}

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
  // X102: boş sahne kaydı silmez; son dolu hal "Devam et" ile geri gelir
  if (!s.parts.length) return;
  // ağır iş ya da fırça darbesi sürerken bekle: yarım durum yazılmasın
  if (s.busy) return schedule();
  writing = true;
  set((st) => ({ session: { ...st.session, saving: true } }));
  try {
    const name = s.parts.find((p) => p.badge !== 'source')?.name ?? 'oturum';
    const bodies = s.parts.filter((p) => p.badge !== 'source').length;
    const savedAt = Date.now();
    await saveSession({ id: sessionId, name, bodies, savedAt }, snapshot(s));
    set((st) => ({ session: { ...st.session, saving: false, savedAt } }));
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
    if (!changed || !s.parts.length) return;
    // yeni model açıldı: eski kayıt önerisi kalkar, yerine bu yazılır
    if (s.session.offer) set((st) => ({ session: { ...st.session, offer: null } }));
    schedule();
  });
}

/** Kayıtlı oturumu açar; `previous`: bir önceki (ezilmiş) oturum. */
export async function restoreSession(slot: SessionSlot = 'current'): Promise<void> {
  closeCoupon();
  const [meta, data] = await Promise.all([loadSessionMeta(slot), loadSession(slot)]);
  if (!data?.parts.length) {
    set((s) => ({ session: { ...s.session, offer: null } }));
    notify(
      'warn',
      slot === 'previous' ? 'Saklanmış önceki oturum yok.' : 'Kayıtlı oturum okunamadı.',
    );
    return;
  }
  // açılan oturum kendi kimliğiyle sürer; ekrandaki çalışma ilk yazmada "önceki" olur
  sessionId = meta?.id ?? newSessionId();
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

/** X106: kartı kapatır; kayıt silinmez, yeni model açılınca "Önceki oturum" olur. */
export function discardSession(): void {
  set((s) => ({ session: { ...s.session, offer: null } }));
}
