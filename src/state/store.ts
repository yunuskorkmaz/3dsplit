import { create } from 'zustand';
import type {
  CutMode,
  CutPreview,
  CutSuggestion,
  EdgeSmoothing,
  PinLayout,
  PinPlacement,
  PinShape,
} from '../core/cut';
import type { SplitDiff } from '../core/smooth';
import type { LabeledMesh, Vec3 } from '../core/types';
import type { SessionMeta } from '../io/session';
import type { ExportFilament } from './exportReport';

export type Tool = 'smart' | 'brush' | 'erase' | 'smooth' | 'bucket' | 'pin' | 'line' | 'seam';
/** source: kesilmiş eski parça (sarı rozet), new: kesimden yeni çıkan parça (mavi rozet). */
export type PartBadge = 'source' | 'new' | null;

/** X115: deneme görünümünde gösterilen tolerans deneme parçası. */
export interface CouponView {
  mode: 'socket' | 'keys';
  clearances: number[];
  /** Şeritte pimin tarifi, ör. "silindir Ø4 × 8 mm". */
  pinText: string;
  parts: { id: string; name: string; mesh: LabeledMesh }[];
}

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
  /** X109: 3MF'ten gelen setin filament numarası; Bambu 3MF'te bu numarayla yazılır. */
  filament?: number;
  /** X111: renk kullanıcı tarafından seçildi; boyanan bölgenin rengi alınmaz. */
  customColor?: boolean;
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
  /** X100: kenar düzeltme gücü. */
  edgeSmoothing: EdgeSmoothing;
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
  /** X110: kendiliğinden kapanmaz. */
  sticky?: boolean;
  /** X110: dışa aktarma eşlemesi, renk kutularıyla gösterilir. */
  filaments?: ExportFilament[];
}

/**
 * Undo kaydı: boyamada değişen üçgenler, kesimde parça listesinin önceki hali.
 * `label`: geçmiş panelinde görünen ad.
 */
/**
 * X105: kesilen bölgenin elle ayarları. Kesim bunları sıfırlar; geri alınca geri gelir.
 * Pimler `partId` + `slot` bölgesine aittir.
 */
export interface RegionState {
  partId: string | null;
  slot: number;
  pins: PinPlacement[];
  direction: Vec3 | null;
  islandDepths: Record<number, number>;
  ringProfile: number[];
}

type HistoryData =
  // boyama kaydı parça kimliğine değil mesh nesnesine bağlı: inceltme/kesim mesh'i değiştirse de kayıt kendi mesh'ine yazar
  | { kind: 'paint'; mesh: LabeledMesh; tris: Uint32Array; before: Uint16Array; after: Uint16Array }
  | {
      kind: 'parts';
      before: Part[];
      after: Part[];
      /** X105: kesimde bölge ayarlarının önceki ve sonraki hali */
      region?: { before: RegionState; after: RegionState };
    }
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
  | {
      kind: 'pins';
      before: PinPlacement[];
      after: PinPlacement[];
      /** X105: pimlerin ait olduğu bölge; geri alınca o bölgeye dönülür */
      partId?: string | null;
      slot?: number;
    }
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
  /** X118: kesimden sonra odağın gideceği gövde satırı (Model ağacı alır, sonra temizler). */
  focusPartId: string | null;
  /**
   * X115: deneme görünümü. Plaka ve pimler sahneye, geçmişe ve oturuma girmez;
   * açıkken görünümde yalnız bunlar çizilir.
   */
  coupon: CouponView | null;
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
  /** X114: önizlemenin bulduğu kesim hatası; `key` girdiler değişmedikçe Kes kapalı. */
  previewError: { key: string; text: string } | null;
  /** D5: son kesim hatasının sorunlu sınır halkaları (kırmızı gösterilir). */
  errorLoops: Vec3[][] | null;
  /** X5: aktif slot bölgesi için kesim modu önerisi. */
  suggestion: CutSuggestion | null;
  /** X103: öneri hesaplanıyor; mod öneriyi izliyorsa Kes bekler. */
  suggesting: boolean;
  /** X72: kullanıcı modu elle seçti; öneri modu artık kendiliğinden değiştirmez. */
  cutModeManual: boolean;
  busy: string | null;
  /** X97: meşgul işin o anki aşaması ve başlama anı (geçen süre için). */
  busyStage: string | null;
  busyStarted: number;
  messages: Message[];
  /** X110: son Bambu 3MF'in filament eşlemesi (sayfa yenilenene kadar). */
  lastExport: ExportFilament[] | null;
  /** X116: son üretilen deneme parçasının çentik → boşluk eşlemesi (tarayıcıda kalır). */
  lastCoupon: LastCoupon | null;
  /** Etiketler yerinde değiştiği için yeniden boyamayı tetikleyen sayaç. */
  paintVersion: number;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

/** X116: son deneme parçası: hangi modla, hangi pimle, soldan sağa boşluklar. */
export interface LastCoupon {
  mode: 'socket' | 'keys';
  pinText: string;
  clearances: number[];
}

const PREFS_KEY = '3dsplit.tool';

/** X116: tarayıcıda kalan kesim tercihleri (Tabla ayarı gibi). */
function loadToolPrefs(): { clearance?: number; lastCoupon: LastCoupon | null } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      const c = v.lastCoupon;
      return {
        clearance:
          typeof v.clearance === 'number' && v.clearance >= 0 && v.clearance <= 1
            ? v.clearance
            : undefined,
        lastCoupon:
          c && (c.mode === 'socket' || c.mode === 'keys') && Array.isArray(c.clearances)
            ? {
                mode: c.mode,
                pinText: String(c.pinText ?? ''),
                clearances: c.clearances.map(Number),
              }
            : null,
      };
    }
  } catch {
    // depolama kapalı olabilir: varsayılan
  }
  return { lastCoupon: null };
}

const toolPrefs = loadToolPrefs();

export const useStore = create<AppState>(() => ({
  parts: [],
  selectedPartId: null,
  slots: DEFAULT_COLORS.slice(0, 4).map((color, id) => ({
    id,
    name: id === 0 ? 'Taban' : `Seçim ${id}`,
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
    clearance: toolPrefs.clearance ?? 0.2,
    squeeze: 0,
    minWall: 0.8,
    inset: 0,
    ringProfile: [0, 0, 0, 0, 0, 0, 0, 0],
    planar: false,
    smoothEdge: true,
    edgeSmoothing: 'medium',
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
  focusPartId: null,
  coupon: null,
  helpOpen: false,
  session: { saving: false, savedAt: null, offer: null },
  simplifyOffer: null,
  paletteOpen: false,
  directionGizmo: false,
  preview: null,
  previewError: null,
  previewActive: false,
  slowPreview: [],
  suggestion: null,
  suggesting: false,
  cutModeManual: false,
  errorLoops: null,
  busy: null,
  busyStage: null,
  busyStarted: 0,
  messages: [],
  lastExport: null,
  lastCoupon: toolPrefs.lastCoupon,
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

// X116: tolerans ve son deneme parçası değişince tarayıcıya yazılır. "Devam et" ile
// gelen oturumun toleransı da böylece yeni tercih olur.
useStore.subscribe((s, prev) => {
  if (s.cut.clearance === prev.cut.clearance && s.lastCoupon === prev.lastCoupon) return;
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ clearance: s.cut.clearance, lastCoupon: s.lastCoupon }),
    );
  } catch {
    // depolama kapalı: sadece bu oturum
  }
});
export const get = useStore.getState;

let messageId = 0;
export function notify(
  kind: Message['kind'],
  text: string,
  extra: Pick<Message, 'sticky' | 'filaments'> = {},
): void {
  // X114: aynı ileti ekranda varsa yenisi eklenmez, süresi yenilenir
  const same = get().messages.find((m) => m.kind === kind && m.text === text);
  const id = same?.id ?? ++messageId;
  if (same)
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...extra } : m)) }));
  else set((s) => ({ messages: [...s.messages.slice(-4), { id, kind, text, ...extra }] }));
  const old = messageTimers.get(id);
  if (old) clearTimeout(old);
  if (kind !== 'error' && !extra.sticky)
    messageTimers.set(
      id,
      setTimeout(() => dismiss(id), 8000),
    );
}

const messageTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismiss(id: number): void {
  messageTimers.delete(id);
  set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
}

/** X111: yeni set rengi bu paletten (tabanın grisi hariç). */
export const SLOT_PALETTE = DEFAULT_COLORS.slice(1);

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

/** X105: aktif bölgenin pim ve kesim ayarları. */
export function regionState(): RegionState {
  const { selectedPartId, activeSlot, pins, cut } = get();
  return {
    partId: selectedPartId,
    slot: activeSlot,
    pins,
    direction: cut.direction,
    islandDepths: cut.islandDepths,
    ringProfile: cut.ringProfile,
  };
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
  if (e.kind === 'removeSlot') return 'Seti kaldır';
  return 'Parça değişikliği';
}
