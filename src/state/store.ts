import { create } from 'zustand';
import type { CutMode, CutPreview, PinShape } from '../core/cut';
import type { LabeledMesh, Vec3 } from '../core/types';

export type Tool = 'smart' | 'brush' | 'bucket' | 'pin';
/** source: kesilmiş eski parça (sarı rozet), new: kesimden yeni çıkan parça (mavi rozet). */
export type PartBadge = 'source' | 'new' | null;

export interface Part {
  id: string;
  name: string;
  mesh: LabeledMesh;
  visible: boolean;
  badge: PartBadge;
  /** Parçanın tek renkle gösterileceği slot (kesimden çıkan parçalar için). */
  colorSlot: number;
  manifold: boolean;
}

export interface Slot {
  id: number;
  name: string;
  color: string;
}

export interface CutSettings {
  mode: CutMode;
  depth: number;
  clearance: number;
  /** Socket squeeze, 0..0.9 */
  squeeze: number;
  pinShape: PinShape;
  pinRadius: number;
  pinLength: number;
  pinOnPart: boolean;
}

export interface Message {
  id: number;
  kind: 'info' | 'warn' | 'error';
  text: string;
}

/** Undo kaydı: boyamada değişen üçgenler, kesimde parça listesinin önceki hali. */
export type HistoryEntry =
  // boyama kaydı parça kimliğine değil mesh nesnesine bağlı: inceltme/kesim mesh'i değiştirse de kayıt kendi mesh'ine yazar
  | { kind: 'paint'; mesh: LabeledMesh; tris: Uint32Array; before: Uint16Array; after: Uint16Array }
  | { kind: 'parts'; before: Part[]; after: Part[] };

const DEFAULT_COLORS = ['#b0b0b0', '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#ff66cc'];

export interface AppState {
  parts: Part[];
  selectedPartId: string | null;
  slots: Slot[];
  activeSlot: number;
  tool: Tool;
  brushRadius: number;
  smartAngle: number;
  /** Smart Fill karşılaştırma ölçeği, mm. 0: otomatik (ortalama kenar × 3). */
  smartScale: number;
  /** Smart Fill sadece içbükey kıvrımlarda dursun (göz, burun gibi çıkıntılar için). */
  smartConcave: boolean;
  gapArea: number;
  /** İnceltme hedef kenar uzunluğu, mm. */
  refineEdge: number;
  cut: CutSettings;
  pinPoints: Vec3[];
  preview: CutPreview | null;
  busy: string | null;
  messages: Message[];
  /** Etiketler yerinde değiştiği için yeniden boyamayı tetikleyen sayaç. */
  paintVersion: number;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export const useStore = create<AppState>(() => ({
  parts: [],
  selectedPartId: null,
  slots: DEFAULT_COLORS.slice(0, 4).map((color, id) => ({ id, name: id === 0 ? 'Taban' : `Slot ${id}`, color })),
  activeSlot: 1,
  tool: 'smart',
  brushRadius: 3,
  smartAngle: 20,
  smartScale: 0,
  smartConcave: true,
  gapArea: 5,
  refineEdge: 1,
  cut: {
    mode: 'socket',
    depth: 3,
    clearance: 0.2,
    squeeze: 0,
    pinShape: 'cylinder',
    pinRadius: 2,
    pinLength: 8,
    pinOnPart: true,
  },
  pinPoints: [],
  preview: null,
  busy: null,
  messages: [],
  paintVersion: 0,
  undoStack: [],
  redoStack: [],
}));

export const set = useStore.setState;
export const get = useStore.getState;

let messageId = 0;
export function notify(kind: Message['kind'], text: string): void {
  const id = ++messageId;
  set((s) => ({ messages: [...s.messages.slice(-4), { id, kind, text }] }));
  if (kind !== 'error') setTimeout(() => dismiss(id), 8000);
}

export function dismiss(id: number): void {
  set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
}

export function nextSlotColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

let partCounter = 0;
export function newPartId(): string {
  return `p${++partCounter}`;
}

/** Dışarıdan gelen kimliklerle çakışmasın diye sayacı ileri alır (proje açma). */
export function reservePartIds(ids: string[]): void {
  for (const id of ids) {
    const n = Number(id.replace(/^p/, ''));
    if (Number.isFinite(n)) partCounter = Math.max(partCounter, n);
  }
}

export function selectedPart(): Part | undefined {
  const s = get();
  return s.parts.find((p) => p.id === s.selectedPartId);
}

export function pushHistory(entry: HistoryEntry): void {
  set((s) => ({ undoStack: [...s.undoStack.slice(-99), entry], redoStack: [] }));
}
