/**
 * X95: oturum tarayıcının IndexedDB'sinde. Özet (`meta`) ayrı tutulur: açılış kartı
 * büyük mesh'leri okumadan gösterilir. Tipli diziler kopyalanmadan (structured clone) yazılır.
 */
import type { LabeledMesh } from '../core/types';

const DB_NAME = '3dsplit';
const STORE = 'session';

export interface SessionMeta {
  /** X106: oturum kimliği; kayıt başka oturumla ezilmeden önce "önceki" olarak saklanır. */
  id?: string;
  name: string;
  bodies: number;
  savedAt: number;
}

export interface SessionPart {
  id: string;
  name: string;
  visible: boolean;
  badge: 'source' | 'new' | null;
  colorSlot: number;
  manifold: boolean;
  /** X98: parçayı üreten işlem. */
  origin?: { feature: string; detail: string };
  mesh: LabeledMesh;
}

export interface SessionData {
  parts: SessionPart[];
  slots: { id: number; name: string; color: string; filament?: number; customColor?: boolean }[];
  activeSlot: number;
  selectedPartId: string | null;
  /** Kesim ayarları ve pimler: biçimi store'da; burada olduğu gibi saklanır. */
  cut: unknown;
  pins: unknown;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Kayıt yeri: son oturum ve onun ezdiği bir önceki. */
export type SessionSlot = 'current' | 'previous';

const KEYS: Record<SessionSlot, { meta: string; data: string }> = {
  current: { meta: 'meta', data: 'data' },
  previous: { meta: 'prevMeta', data: 'prevData' },
};

/**
 * Oturumu yazar. X106: kayıttaki oturum başka bir oturumsa (kimlik farklı) önce
 * "önceki" yerine taşınır; böylece yeni model açmak eski çalışmayı sormadan silmez.
 */
export async function saveSession(meta: SessionMeta, data: SessionData): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const old = s.get(KEYS.current.meta);
      old.onsuccess = () => {
        const prev = old.result as SessionMeta | undefined;
        if (prev && prev.id !== meta.id) {
          const prevData = s.get(KEYS.current.data);
          prevData.onsuccess = () => {
            s.put(prev, KEYS.previous.meta);
            s.put(prevData.result, KEYS.previous.data);
            s.put(data, KEYS.current.data);
            s.put(meta, KEYS.current.meta);
          };
        } else {
          s.put(data, KEYS.current.data);
          s.put(meta, KEYS.current.meta);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSessionMeta(slot: SessionSlot = 'current'): Promise<SessionMeta | null> {
  try {
    return (
      ((await run('readonly', (s) => s.get(KEYS[slot].meta))) as SessionMeta | undefined) ?? null
    );
  } catch {
    // depolama kapalı (gizli pencere): kurtarma yok
    return null;
  }
}

export async function loadSession(slot: SessionSlot = 'current'): Promise<SessionData | null> {
  return (
    ((await run('readonly', (s) => s.get(KEYS[slot].data))) as SessionData | undefined) ?? null
  );
}
