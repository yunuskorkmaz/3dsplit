import type { Manifold } from 'manifold-3d';
import { modelManifold, type Scope } from './kernel';
import type { LabeledMesh, MeshData, Vec3 } from './types';

export type CutMode = 'fast' | 'socket' | 'keys';

export type PinShape = 'cylinder' | 'cube' | 'octagon' | 'snap';

export interface PinOptions {
  shape: PinShape;
  /** Pim yarıçapı (küpte yarı genişlik), mm. */
  radius: number;
  /** Pimin toplam boyu, mm. Yarısı parçada, yarısı karşı tarafta kalır. */
  length: number;
  /** true: pim kesilen parçada, yuva gövdede. */
  onPart: boolean;
  /**
   * X31: eksenel boşluk, mm: delik pimden her uçta bu kadar uzun olur, pim
   * dibe oturmaz (kesim yüzeyleri birbirine değer). Verilmezse `clearance`.
   */
  depthClearance?: number;
  /**
   * X32: pim uçlarında pah, mm (konik uç). Yuvaya kolay girer, baskıda uç
   * sarkmaz. Delik pahlanmaz. Snap pimde kullanılmaz.
   */
  chamfer?: number;
  /**
   * X33: yarıçap ve boy kesitten hesaplanır (kendi boyutu verilmiş pimler
   * hariç): yarıçap, pim merkezinden kesim halkasına en kısa uzaklığın ve
   * adadaki pim başına düşen alanın payı; boy yarıçapın 4 katı.
   */
  auto?: boolean;
  /**
   * Pim boyunun gövde (kesim yüzeyinin eksen yönündeki) tarafında kalan payı,
   * 0..1; verilmezse 0.5 (yarı yarıya). Pim parçadaysa bu, gövdedeki yuvanın
   * derinliğini belirler.
   */
  bodyRatio?: number;
}

/** Tek bir pimin yeri ve (isteğe bağlı) kendine özgü boyutu/ekseni. */
export interface PinPlacement {
  /** Yüzeyde tıklanan nokta; kapak yüzeyine izdüşürülür. */
  point: Vec3;
  radius?: number;
  length?: number;
  /** Pimin ekseni (herhangi bir yönde verilebilir; gövdeye bakacak şekilde çevrilir). */
  axis?: Vec3;
  /** Bu pime özgü gövde payı (`PinOptions.bodyRatio`). */
  bodyRatio?: number;
}

export interface CutOptions {
  mode: CutMode;
  slot: number;
  /** Socket: tapanın yüzeyden içeri uzandığı derinlik, mm. */
  depth: number;
  /** C12 (Link all kapalı): ada anahtarı -> kendi derinliği. Verilmeyen ada `depth` kullanır. */
  depthByIsland?: Record<number, number>;
  /** Tapa/yuva ve pim/yuva arasındaki boşluk, mm. */
  clearance: number;
  /** Socket: tapa tabanının içe daralma oranı (0 düz, 0.5 taban yarı genişlikte). */
  squeeze?: number;
  /**
   * C7: tapa ayağının kenardan içeri çekilmesi, mm (0: tam yüzey). Çıkıntıda
   * görünen kısım aynı kalır, gövdeye giren ayak daralır; yuvanın çevresinde
   * gövdede taşıyıcı basamak kalır. Düz yamada görünen tapa da daralır.
   */
  inset?: number;
  /**
   * C6: tapa alt halkasının 8 yöndeki radyal düzeltmesi, mm (+ dışa). Yönler tapa
   * ekseninin etrafında `orthoBasis(yön)` tabanına göre 0°, 45°, … 315°; aradaki
   * açılar yumuşak (kosinüs) aradeğerlenir.
   */
  ringProfile?: number[];
  /** Önizlemede yuva çevresindeki en az duvar kalınlığı, mm (0: kontrol yok). */
  minWall?: number;
  /** Socket uzama yönü (dışa doğru). Verilmezse bölge normallerinin ortalaması. */
  direction?: Vec3;
  pin: PinOptions;
  /** Keys: yüzeyde tıklanan pimler. Boşsa her adanın kapak merkezine bir pim. */
  pins?: PinPlacement[];
  /**
   * X4 (Fast/Keys): true ise sınır halkası yerine halkaya en uygun düzlemle
   * kesilir (dümdüz kesim yüzeyi). Kapak üretilemezse otomatik de kullanılır.
   */
  planar?: boolean;
  /**
   * X53: kesimden önce slot sınırını üçgenlerin içinden geçir. Boyama kaydına
   * yazılmaz; manifold önbelleği bu kopyaya ayrı anahtarla bağlanır.
   */
  smoothEdge?: boolean;
  /**
   * X56: dikiş halkasının köşe sırası. Varsa boyalı slot kesilmez; model bu
   * halkanın düzleminden iki kapalı parçaya ayrılır.
   */
  seamLoop?: number[];
  /**
   * X64: düz kesilen yüzler arasında bırakılan boşluk, mm. 0 ise yüzler
   * birbirine değer. Pim toleransından ayrıdır. Eğri (çizgiyi izleyen) kesitte uygulanmaz.
   */
  faceGap?: number;
}

export interface CutResult {
  body: LabeledMesh;
  parts: LabeledMesh[];
  warnings: string[];
}

export interface CutPreview {
  /** Tapa hacimleri veya kesim kapakları. */
  volumes: MeshData[];
  pins: MeshData[];
  /** Duvarın `minWall`'dan ince kaldığı yerler (yuva büyütülünce modelin dışına taşan kısım). */
  thin: MeshData[];
  /** C6: tapa alt halkasındaki 8 kontrol yönünün noktaları (ilki 0°). */
  ringMarkers: Vec3[];
  warnings: string[];
}

/** Kesim hatası. `loops`: sorunlu bölgenin sınır halkaları (arayüzde kırmızı gösterilir). */
export class CutError extends Error {
  loops?: Vec3[][];
  constructor(message: string, loops?: Vec3[][]) {
    super(message);
    this.loops = loops;
  }
}

/**
 * Modelin manifold'u (yüz kimliği = üçgen numarası). Worker aynı geometri
 * için önbellekten verir; verilmezse her çağrıda kurulur. Etiketlerden
 * bağımsızdır, boyama değişse de geçerli kalır.
 */
export type ModelProvider = () => Manifold;

let modelProvider: ModelProvider | null = null;

export function modelOf(mesh: LabeledMesh, scope: Scope): Manifold {
  // sağlayıcının verdiği manifold önbellektedir: scope'a eklenmez (silinmesin)
  return modelProvider ? modelProvider() : scope.keep(modelManifold(mesh));
}

export function withModel<T>(provider: ModelProvider | undefined, fn: () => T): T {
  modelProvider = provider ?? null;
  try {
    return fn();
  } finally {
    modelProvider = null;
  }
}

export interface Island {
  tris: number[];
  loops: number[][];
  /** Alan ağırlıklı ortalama dış normal. */
  normal: Vec3;
  /** En büyük sınır halkasının düzlemi (Newell normali) ve merkezi. */
  capNormal: Vec3;
  capCenter: Vec3;
  mainLoop: number[];
  /** Tüm mesh'in komşuluk tablosu (adalar arasında ortak). */
  adj: Int32Array;
  /** Kararlı kimlik: adanın (delik katılmadan önceki) en küçük üçgen numarası. Arayüz aynı yolla hesaplar. */
  key: number;
}
