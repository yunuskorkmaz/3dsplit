/**
 * X95: oturum tarayıcının IndexedDB'sinde. Özet (`meta`) ayrı tutulur: açılış kartı
 * büyük mesh'leri okumadan gösterilir. Tipli diziler kopyalanmadan (structured clone) yazılır.
 */
import type { LabeledMesh } from '../core/types';

const DB_NAME = '3dsplit';
const STORE = 'session';

export interface SessionMeta {
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
  slots: { id: number; name: string; color: string }[];
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

export async function saveSession(meta: SessionMeta, data: SessionData): Promise<void> {
  await run('readwrite', (s) => {
    s.put(data, 'data');
    return s.put(meta, 'meta');
  });
}

export async function loadSessionMeta(): Promise<SessionMeta | null> {
  try {
    return ((await run('readonly', (s) => s.get('meta'))) as SessionMeta | undefined) ?? null;
  } catch {
    // depolama kapalı (gizli pencere): kurtarma yok
    return null;
  }
}

export async function loadSession(): Promise<SessionData | null> {
  return ((await run('readonly', (s) => s.get('data'))) as SessionData | undefined) ?? null;
}

export async function clearSession(): Promise<void> {
  try {
    await run('readwrite', (s) => {
      s.delete('data');
      return s.delete('meta');
    });
  } catch {
    // depolama kapalı
  }
}
