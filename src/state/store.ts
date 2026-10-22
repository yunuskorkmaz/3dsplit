import { create } from 'zustand';
import type {
  CutMode,
  CutPreview,
  CutSuggestion,
  PinLayout,
  PinPlacement,
  PinShape,
} from '../core/cut';
import type { SplitDiff } from '../core/smooth';
import type { LabeledMesh, Vec3 } from '../core/types';
import type { SessionMeta } from '../io/session';

export type Tool = 'smart' | 'brush' | 'erase' | 'smooth' | 'bucket' | 'pin' | 'line' | 'seam';
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
  /** X98: parçayı üreten işlem: "Kes 2" ve ayrıntısı ("Tapa · Seçim 1"). Açılan modelde yok. */
  origin?: { feature: string; detail: string };
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
  /** X53: kesimden önce sınırı üçgenlerin içinden geçir. */
  smoothEdge: boolean;
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
  /** X31: pim deliğinin her uçta pimden uzunluğu, mm. */
  pinDepthClearance: number;
  /** X32: pim ucu pahı, mm. */
  pinChamfer: number;
  /** X33: pim yarıçapı ve boyu kesitten hesaplansın. */
  pinAuto: boolean;
  /** Pim boyunun gövde (yuva) tarafında kalan payı, 0..1 (0.5: yarı yarıya). */
  pinBodyRatio: number;
  /** X64: düz kesilen yüzler arası boşluk, mm. 0 ise birbirine değer. */
  faceGap: number;
}

export interface Message {
  id: number;
  kind: 'info' | 'warn' | 'error';
  text: string;
}

/**
 * Undo kaydı: boyamada değişen üçgenler, kesimde parça listesinin önceki hali.
 * `label`: geçmiş panelinde görünen ad.
 */
type HistoryData =
  // boyama kaydı parça kimliğine değil mesh nesnesine bağlı: inceltme/kesim mesh'i değiştirse de kayıt kendi mesh'ine yazar
  | { kind: 'paint'; mesh: LabeledMesh; tris: Uint32Array; before: Uint16Array; after: Uint16Array }
  | { kind: 'parts'; before: Part[]; after: Part[] }
  | {
      kind: 'removeSlot';
      slotId: number;
      beforeSlots: Slot[];
      afterSlots: Slot[];
      activeBefore: number;
      activeAfter: number;
      paints: { mesh: LabeledMesh; tris: Uint32Array }[];
      colorBefore: { id: string; colorSlot: number }[];
    }
  // Keys pimleri (ekleme, silme, taşıma, döndürme, boyut)
  | { kind: 'pins'; before: PinPlacement[]; after: PinPlacement[] }
  // X34/X30: üçgen bölme mesh üzerinde yerinde; sadece fark saklanır (tam kopya belleği doldururdu)
  | { kind: 'split'; mesh: LabeledMesh; diff: SplitDiff }
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

/** `time`: kaydın son güncellendiği an (art arda gelen aynı adlı pim değişiklikleri birleşir). */
export type HistoryEntry = HistoryData & { label?: string; time?: number };

const DEFAULT_COLORS = [
  '#b0b0b0',
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f1c40f',
  '#9b59b6',
  '#e67e22',
  '#1abc9c',
  '#34495e',
  '#ff66cc',
];

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
  /** X30: "Tüm sınırı yumuşat" sınırı üçgenlerin içinden geçirsin (üçgenler bölünür). */
  smoothExact: boolean;
  /** Yumuşatma fırçasının gücü, 0..1. */
  smoothStrength: number;
  gapArea: number;
  /** İnceltme hedef kenar uzunluğu, mm. */
  refineEdge: number;
  cut: CutSettings;
  /** Keys pimleri; boyut/eksen verilmemişse kesim ayarındaki değerler kullanılır. */
  pins: PinPlacement[];
  /** Keys pimlerinin hesaplanmış yeri/ekseni/boyutu (otomatik olanlar dahil); pim görüntüsü için. */
  pinLayout: PinLayout[];
  /** Seçili pimin tutamağı: taşı ya da döndür. */
  pinGizmo: 'translate' | 'rotate';
  /** Pim aracında seçili pim (-1: yok). */
  selectedPin: number;
  /** B7: X-ray: model yarı saydam, fırça/silgi küredeki tüm üçgenleri boyar (arka yüzler dahil). */
  xray: boolean;
  /** X87: gezinme çubuğundan seçilen kip; sol tuş kamerayı yönetir. Araç seçilince ya da Esc ile biter. */
  navMode: 'orbit' | 'pan' | 'zoom' | null;
  /** X77: seçili olmayan renkleri soldur (X57 görünümü). Kapalıyken bütün renkler tam görünür. */
  dimOthers: boolean;
  /** X85: boyası geçici gizlenen renkler (yalnız görüntü; taban rengiyle çizilir). */
  hiddenSlots: number[];
  /** E1: kamera düzeni, ters yakınlaştırma ve X82 tabla (tarayıcıda hatırlanır). */
  camera: CameraPrefs;
  /** B8: ayna boyama. `offset` null ise parçanın sınır kutusunun ortası. */
  mirror: { enabled: boolean; axis: 0 | 1 | 2; offset: number | null };
  /** X36: çizgi aracında tıklanan köşeler ve aralarındaki yüzey yolu (köşe numaraları). */
  line: {
    partId: string | null;
    anchors: number[];
    path: number[];
    /** Dikiş halkası kapanınca. Çizgi aracı boyayıp temizler. */
    closed?: boolean;
    /** Dikiş düzleme uymadı; halka kırmızı. */
    bad?: boolean;
  };
  /** X27: patlatılmış görünüm çarpanı (0: kapalı). Sadece görüntü. */
  explode: number;
  /** X26: yardım penceresi açık mı. */
  helpOpen: boolean;
  /** X96: 1M üçgeni aşan model açılınca sadeleştirme önerisi (parçalar ve toplam üçgen). */
  simplifyOffer: { partIds: string[]; triangles: number } | null;
  /** X95: oturum kaydı durumu (üst çubukta) ve açılışta önerilen kayıtlı oturum. */
  session: { saving: boolean; savedAt: number | null; offer: SessionMeta | null };
  /** X90: komut arama açık. */
  paletteOpen: boolean;
  /**
   * Önizleme modu açık mı. Açıkken kesim ayarı, pim, slot, boyama veya parça
   * değişince önizleme kendiliğinden yenilenir (kapanmaz).
   */
  previewActive: boolean;
  /**
   * X78: son önizlemesi uzun süren (1,5 s üstü) parça meshleri, kesim modu başına.
   * Bunlarda önizleme kendiliğinden açılmaz; Space ile açılır. Mesh değişince
   * (kesim, onarım, ölçek) düşer.
   */
  slowPreview: { mesh: LabeledMesh; mode: CutMode }[];
  /** Socket yön gizmosu açık mı. */
  directionGizmo: boolean;
  preview: CutPreview | null;
  /** D5: son kesim hatasının sorunlu sınır halkaları (kırmızı gösterilir). */
  errorLoops: Vec3[][] | null;
  /** X5: aktif slot bölgesi için kesim modu önerisi. */
  suggestion: CutSuggestion | null;
  /** X72: kullanıcı modu elle seçti; öneri modu artık kendiliğinden değiştirmez. */
  cutModeManual: boolean;
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
  slots: DEFAULT_COLORS.slice(0, 4).map((color, id) => ({
    id,
    name: id === 0 ? 'Taban' : `Renk ${id}`,
    color,
  })),
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
  smoothExact: true,
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
    smoothEdge: true,
    linkAll: true,
    islandDepths: {},
    direction: null,
    pinShape: 'cylinder',
    pinRadius: 2,
    pinLength: 8,
    pinOnPart: true,
    pinDepthClearance: 0.3,
    pinChamfer: 0.4,
    pinAuto: true,
    pinBodyRatio: 0.5,
    faceGap: 0,
  },
  pins: [],
  selectedPin: -1,
  pinLayout: [],
  pinGizmo: 'translate',
  mirror: { enabled: false, axis: 0, offset: null },
  camera: loadCameraPrefs(),
  xray: false,
  navMode: null,
  dimOthers: false,
  hiddenSlots: [],
  line: { partId: null, anchors: [], path: [] },
  explode: 0,
  helpOpen: false,
  session: { saving: false, savedAt: null, offer: null },
  simplifyOffer: null,
  paletteOpen: false,
  directionGizmo: false,
  preview: null,
  previewActive: false,
  slowPreview: [],
  suggestion: null,
  cutModeManual: false,
  errorLoops: null,
  busy: null,
  messages: [],
  paintVersion: 0,
  undoStack: [],
  redoStack: [],
}));

export interface CameraPrefs {
  mode: 'default' | 'blender';
  invertZoom: boolean;
  /** X82: baskı tablası görünür. */
  bed: boolean;
}

function loadCameraPrefs(): CameraPrefs {
  try {
    const raw = localStorage.getItem('3dsplit.camera');
    if (raw) {
      const v = JSON.parse(raw);
      return {
        mode: v.mode === 'blender' ? 'blender' : 'default',
        invertZoom: !!v.invertZoom,
        bed: v.bed !== false,
      };
    }
  } catch {
    // depolama kapalı olabilir: varsayılan
  }
  return { mode: 'default', invertZoom: false, bed: true };
}

export function setCameraPrefs(camera: CameraPrefs): void {
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

export function pushHistory(entry: HistoryEntry, label?: string): void {
  if (label) entry.label = label;
  set((s) => ({ undoStack: [...s.undoStack.slice(-99), entry], redoStack: [] }));
}

/** Geçmiş panelinde kaydın adı. */
export function historyLabel(e: HistoryEntry): string {
  if (e.label) return e.label;
  if (e.kind === 'paint') return 'Boyama';
  if (e.kind === 'geometry') return 'Yumuşatma';
  if (e.kind === 'split') return 'Üçgen bölme';
  if (e.kind === 'pins') return 'Pim';
  if (e.kind === 'removeSlot') return 'Rengi kaldır';
  return 'Parça değişikliği';
}
