import { create } from 'zustand';
import type { CutMode, CutPreview, CutSuggestion, PinPlacement, PinShape } from '../core/cut';
import type { LabeledMesh, Vec3 } from '../core/types';

export type Tool = 'smart' | 'brush' | 'erase' | 'smooth' | 'bucket' | 'pin';
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
  /** Önizlemede kontrol edilen en az duvar kalınlığı, mm. */
  minWall: number;
  /** C7: tapa ayağının kenardan içeri çekilmesi, mm (0: tam yüzey). */
  inset: number;
  /** C6: tapa alt halkasının 8 yönlü radyal düzeltmesi, mm. */
  ringProfile: number[];
  /** X4: Fast/Keys düzlemle keser. */
  planar: boolean;
  /** C12: açıkken tüm bölgeler aynı derinlikte; kapalıyken `islandDepths`. */
  linkAll: boolean;
  /** Ada anahtarı (en küçük üçgen numarası) -> derinlik. */
  islandDepths: Record<number, number>;
  /** Socket uzama yönü (dışa doğru); null: otomatik. */
  direction: Vec3 | null;
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
  | { kind: 'parts'; before: Part[]; after: Part[] }
  // yumuşatma fırçası: mesh yerinde değişir, sadece değişen köşe ve üçgenler saklanır
  | {
      kind: 'geometry';
      mesh: LabeledMesh;
      verts: Uint32Array;
      posBefore: Float32Array;
      posAfter: Float32Array;
      tris: Uint32Array;
      labelsBefore: Uint16Array;
      labelsAfter: Uint16Array;
    };

const DEFAULT_COLORS = ['#b0b0b0', '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#ff66cc'];

export interface AppState {
  parts: Part[];
  selectedPartId: string | null;
  slots: Slot[];
  activeSlot: number;
  tool: Tool;
  brushRadius: number;
  smartAngle: number;
  /** Smart Fill karşılaştırma ölçeği, mm. 0: otomatik (tıklanan özelliğe göre seçilir). */
  smartScale: number;
  /** Otomatik modda son tıklamada seçilen ölçek (gösterim için). */
  smartAutoScale: number;
  /** Smart Fill sadece içbükey kıvrımlarda dursun (göz, burun gibi çıkıntılar için). */
  smartConcave: boolean;
  /** Smart Fill sonucu çıkıntının dibindeki vadi çizgisine oturtulsun. */
  smartValley: boolean;
  /** "Tümünü yumuşat" yarıçapı, mm. 0: otomatik (Smart Fill ölçeği). */
  smoothRadius: number;
  /** Yumuşatma fırçasının gücü, 0..1. */
  smoothStrength: number;
  gapArea: number;
  /** İnceltme hedef kenar uzunluğu, mm. */
  refineEdge: number;
  cut: CutSettings;
  /** Keys pimleri; boyut/eksen verilmemişse kesim ayarındaki değerler kullanılır. */
  pins: PinPlacement[];
  /** Pim aracında seçili pim (-1: yok). */
  selectedPin: number;
  /** B7: X-ray: model yarı saydam, fırça/silgi küredeki tüm üçgenleri boyar (arka yüzler dahil). */
  xray: boolean;
  /** E1: kamera düzeni ve ters yakınlaştırma (tarayıcıda hatırlanır). */
  camera: { mode: 'default' | 'blender'; invertZoom: boolean };
  /** B8: ayna boyama. `offset` null ise parçanın sınır kutusunun ortası. */
  mirror: { enabled: boolean; axis: 0 | 1 | 2; offset: number | null };
  /** Socket yön gizmosu açık mı. */
  directionGizmo: boolean;
  preview: CutPreview | null;
  /** D5: son kesim hatasının sorunlu sınır halkaları (kırmızı gösterilir). */
  errorLoops: Vec3[][] | null;
  /** X5: aktif slot bölgesi için kesim modu önerisi. */
  suggestion: CutSuggestion | null;
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
  smartAutoScale: 0,
  smartConcave: true,
  smartValley: true,
  smoothRadius: 0,
  smoothStrength: 0.5,
  gapArea: 5,
  refineEdge: 1,
  cut: {
    mode: 'socket',
    depth: 3,
    clearance: 0.2,
    squeeze: 0,
    minWall: 0.8,
    inset: 0,
    ringProfile: [0, 0, 0, 0, 0, 0, 0, 0],
    planar: false,
    linkAll: true,
    islandDepths: {},
    direction: null,
    pinShape: 'cylinder',
    pinRadius: 2,
    pinLength: 8,
    pinOnPart: true,
  },
  pins: [],
  selectedPin: -1,
  mirror: { enabled: false, axis: 0, offset: null },
  camera: loadCameraPrefs(),
  xray: false,
  directionGizmo: false,
  preview: null,
  suggestion: null,
  errorLoops: null,
  busy: null,
  messages: [],
  paintVersion: 0,
  undoStack: [],
  redoStack: [],
}));

function loadCameraPrefs(): { mode: 'default' | 'blender'; invertZoom: boolean } {
  try {
    const raw = localStorage.getItem('3dsplit.camera');
    if (raw) {
      const v = JSON.parse(raw);
      return { mode: v.mode === 'blender' ? 'blender' : 'default', invertZoom: !!v.invertZoom };
    }
  } catch {
    // depolama kapalı olabilir: varsayılan
  }
  return { mode: 'default', invertZoom: false };
}

export function setCameraPrefs(camera: { mode: 'default' | 'blender'; invertZoom: boolean }): void {
  useStore.setState({ camera });
  try {
    localStorage.setItem('3dsplit.camera', JSON.stringify(camera));
  } catch {
    // depolama kapalı: sadece bu oturum
  }
}

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

/** Slot rengi; tabanın grisi (paletin ilk rengi) boyalı slotlara verilmez, yoksa bölge görünmez. */
export function nextSlotColor(index: number): string {
  const palette = DEFAULT_COLORS.slice(1);
  return palette[(Math.max(1, index) - 1) % palette.length];
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
