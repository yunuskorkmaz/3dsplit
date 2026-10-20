import { boundingBox } from '../core/geometry';
import {
  brushSelect,
  bucketFill,
  chooseSmartScale,
  cleanSelection,
  closeHoles,
  gapFill,
  refineToValley,
  type SmartFillOptions,
  smartFill,
} from '../core/paint';
import { type SplitDiff, smoothRegionBoundary } from '../core/smooth';
import { mirrorPoint } from '../core/spatial';
import { connectedComponents } from '../core/topology';
import { BASE_SLOT, type LabeledMesh, type Vec3 } from '../core/types';
import { onLabelsChanged } from './actionsHooks';
import { applyMeshSplit } from './actionsSmooth';
import {
  get,
  type HistoryEntry,
  nextSlotColor,
  notify,
  type Part,
  pushHistory,
  selectedPart,
  set,
} from './store';
import { concavityOf, gridOf, type Topology, topologyOf } from './topologyCache';

// ---------- boyama ----------

interface Stroke {
  partId: string;
  before: Map<number, number>;
  /** Geçmiş panelindeki ad. */
  label: string;
}

let stroke: Stroke | null = null;

/** Son Smart Fill; eşik değişince canlı yeniden hesaplanır. */
let lastSmart: {
  partId: string;
  seeds: number[];
  entry: Extract<HistoryEntry, { kind: 'paint' }>;
} | null = null;

/** Dosya açılınca yarım kalmış boya darbesini ve canlı Smart Fill'i düşürür. */
export function clearPaintSession(): void {
  stroke = null;
  lastSmart = null;
}

/** Geri alma ve yumuşatma, canlı Smart Fill hesabını geçersiz kılar. */
export function clearLastSmart(): void {
  lastSmart = null;
}

// ---------- ayna (B8) ----------

/** Ayna düzleminin konumu: elle verilmediyse parçanın sınır kutusunun ortası. */
export function mirrorOffset(part: Part | undefined = selectedPart()): number {
  const { mirror } = get();
  if (mirror.offset !== null) return mirror.offset;
  if (!part) return 0;
  const { min, max } = boundingBox(part.mesh.positions);
  return (min[mirror.axis] + max[mirror.axis]) / 2;
}

/** Aynadaki karşılık: nokta ve en yakın üçgen. Ayna kapalıysa veya karşılık yoksa null. */
export function mirrored(part: Part, point: Vec3): { point: Vec3; tri: number } | null {
  const { mirror } = get();
  if (!mirror.enabled) return null;
  const q = mirrorPoint(point, mirror.axis, mirrorOffset(part));
  const topo = topologyOf(part.mesh);
  // karşı taraf yüzeyde değilse (asimetrik model) çok uzağa atlamasın
  const tri = gridOf(part.mesh).nearest(q, topo.meanEdge * 6);
  return tri < 0 ? null : { point: q, tri };
}

function triCenter(part: Part, t: number): Vec3 {
  const c = topologyOf(part.mesh).centroids;
  return [c[3 * t], c[3 * t + 1], c[3 * t + 2]];
}

export function partById(id: string): Part | undefined {
  return get().parts.find((p) => p.id === id);
}

export function applyLabels(part: Part, tris: ArrayLike<number>, label: number): void {
  const labels = part.mesh.labels;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    if (stroke && !stroke.before.has(t)) stroke.before.set(t, labels[t]);
    labels[t] = label;
  }
  set((s) => ({ paintVersion: s.paintVersion + 1, errorLoops: null }));
  onLabelsChanged?.(part.id, tris);
}

export function beginStroke(partId: string, label = 'Boyama'): void {
  stroke = { partId, before: new Map(), label };
}

export function endStroke(): Extract<HistoryEntry, { kind: 'paint' }> | null {
  if (!stroke) return null;
  const part = partById(stroke.partId);
  const s = stroke;
  stroke = null;
  if (!part || s.before.size === 0) return null;
  const tris = Uint32Array.from(s.before.keys());
  const before = Uint16Array.from(s.before.values());
  const after = Uint16Array.from(tris, (t) => part.mesh.labels[t]);
  const entry = { kind: 'paint' as const, mesh: part.mesh, tris, before, after, label: s.label };
  pushHistory(entry);
  return entry;
}

function paintLabel(erase: boolean): number {
  return erase ? BASE_SLOT : get().activeSlot;
}

export function brushAt(partId: string, tri: number, point: Vec3, erase: boolean): void {
  const part = partById(partId);
  if (!part) return;
  const topo = topologyOf(part.mesh);
  const { brushRadius, xray } = get();
  // X-ray: yüzey boyunca değil, küre içindeki her üçgen (arka/gizli yüzler dahil)
  const select = (t: number, p: Vec3) =>
    xray
      ? gridOf(part.mesh).within(p, brushRadius)
      : brushSelect(topo.adj, topo.centroids, t, p, brushRadius);
  applyLabels(part, select(tri, point), paintLabel(erase));
  const m = mirrored(part, point);
  if (m) applyLabels(part, select(m.tri, m.point), paintLabel(erase));
}

export function bucketAt(partId: string, tri: number, erase: boolean): void {
  const part = partById(partId);
  if (!part) return;
  beginStroke(partId, erase ? 'Kova (sil)' : 'Kova');
  const m = mirrored(part, triCenter(part, tri));
  const mirrorTris = m ? bucketFill(topologyOf(part.mesh).adj, part.mesh.labels, m.tri) : [];
  applyLabels(
    part,
    bucketFill(topologyOf(part.mesh).adj, part.mesh.labels, tri),
    paintLabel(erase),
  );
  if (mirrorTris.length) applyLabels(part, mirrorTris, paintLabel(erase));
  endStroke();
}

function smartOptions(topo: Topology): SmartFillOptions {
  const { smartAngle, smartScale, smartConcave } = get();
  return {
    maxAngleDeg: smartAngle,
    scale: smartScale > 0 ? smartScale : topo.meanEdge * 3,
    concaveOnly: smartConcave,
  };
}

/**
 * Smart Fill + vadiye oturtma + seçimin içinde kalan küçük deliklerin
 * kapatılması. Sadece tohumla aynı etiketli üçgenler eklenir; başka slota
 * boyanmış yerlerin üzerine yazılmaz.
 */
function smartSelect(topo: Topology, mesh: LabeledMesh, seed: number): Uint32Array {
  const labels = mesh.labels;
  const opts = smartOptions(topo);
  const seedLabel = labels[seed];
  const same = (t: number) => labels[t] === seedLabel;
  let tris: ArrayLike<number>;
  if (get().smartScale > 0) {
    tris = smartFill(topo.adj, topo.normals, topo.centroids, seed, opts);
  } else {
    // X14: ölçek tıklanan özelliğe göre seçilir (göz küçük, kulak büyük ölçek ister)
    const auto = chooseSmartScale(
      topo.adj,
      topo.normals,
      topo.centroids,
      topo.areas,
      seed,
      topo.meanEdge,
      {
        maxAngleDeg: opts.maxAngleDeg,
        concaveOnly: opts.concaveOnly,
      },
    );
    tris = auto.tris;
    opts.scale = auto.scale;
    set({ smartAutoScale: auto.scale });
  }
  if (get().smartValley) {
    const mask = new Uint8Array(labels.length);
    for (let i = 0; i < tris.length; i++) mask[tris[i]] = 1;
    const refined = refineToValley(
      topo.adj,
      topo.centroids,
      concavityOf(mesh, opts.scale),
      mask,
      opts.scale * 2,
    );
    for (let t = 0; t < refined.length; t++) if (refined[t] && !same(t)) refined[t] = 0;
    // vadi seçimi tohumu dışarıda bırakırsa (ör. düz alana tıklama) ham sonuç kalır
    if (refined[seed]) {
      const clean = cleanSelection(topo.adj, topo.areas, refined, { keepSeed: seed, accept: same });
      const out: number[] = [];
      for (let t = 0; t < clean.length; t++) if (clean[t]) out.push(t);
      tris = out;
    }
  }
  return Uint32Array.from(
    closeHoles(topo.adj, topo.areas, tris, { maxHoleFraction: 0.05, accept: same }).tris,
  );
}

/** Birden çok tohum (ayna): hepsi aynı etiket durumunda hesaplanıp birleştirilir. */
function smartSelectMany(topo: Topology, mesh: LabeledMesh, seeds: number[]): Uint32Array {
  if (seeds.length === 1) return smartSelect(topo, mesh, seeds[0]);
  const all = new Set<number>();
  for (const s of seeds) {
    if (all.has(s)) continue;
    for (const t of smartSelect(topo, mesh, s)) all.add(t);
  }
  return Uint32Array.from(all);
}

/** Otomatik ölçekte seçili parçanın kullanacağı değer (arayüzde göstermek için). */
export function autoSmartScale(): number {
  const { smartAutoScale } = get();
  if (smartAutoScale > 0) return smartAutoScale;
  const part = selectedPart();
  return part ? topologyOf(part.mesh).meanEdge * 3 : 0;
}

export function smartFillAt(partId: string, tri: number, erase: boolean): void {
  const part = partById(partId);
  if (!part) return;
  const topo = topologyOf(part.mesh);
  beginStroke(partId, erase ? 'Smart Fill (sil)' : 'Smart Fill');
  const m = mirrored(part, triCenter(part, tri));
  const seeds = m && m.tri !== tri ? [tri, m.tri] : [tri];
  const tris = smartSelectMany(topo, part.mesh, seeds);
  applyLabels(part, tris, paintLabel(erase));
  const entry = endStroke();
  lastSmart = entry ? { partId, seeds, entry } : null;
  warnIfLeaked(tris.length, part.mesh.labels.length);
}

function warnIfLeaked(selected: number, total: number): void {
  if (selected > total * 0.5) {
    notify(
      'warn',
      'Seçim modelin yarısından fazlasına yayıldı. Açıyı düşürün (Shift+sağ sürükle) veya Ctrl+Z.',
    );
  }
}

/** Eşik değişti: son Smart Fill'i geri alıp yeni eşikle tekrarlar. */
export function setSmartAngle(angle: number): void {
  setSmartOptions({ smartAngle: Math.max(1, Math.min(180, angle)) });
}

/** Smart Fill ayarı değişti: son Smart Fill yeni ayarla canlı tekrarlanır. */
export function setSmartOptions(patch: {
  smartAngle?: number;
  smartScale?: number;
  smartConcave?: boolean;
  smartValley?: boolean;
}): void {
  set(patch);
  const undo = get().undoStack;
  if (!lastSmart || undo[undo.length - 1] !== lastSmart.entry) return;
  const part = partById(lastSmart.partId);
  const { entry } = lastSmart;
  if (!part || part.mesh !== entry.mesh) return;
  const labels = part.mesh.labels;
  for (let i = 0; i < entry.tris.length; i++) labels[entry.tris[i]] = entry.before[i];
  onLabelsChanged?.(part.id, entry.tris);
  const label = entry.after[0];
  const topo = topologyOf(part.mesh);
  const tris = smartSelectMany(topo, part.mesh, lastSmart.seeds);
  entry.tris = tris;
  entry.before = Uint16Array.from(tris, (t) => labels[t]);
  for (let i = 0; i < tris.length; i++) labels[tris[i]] = label;
  entry.after = new Uint16Array(tris.length).fill(label);
  onLabelsChanged?.(part.id, tris);
  set((s) => ({ paintVersion: s.paintVersion + 1 }));
}

export function gapFillSelected(): void {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  const topo = topologyOf(part.mesh);
  const { tris, newLabels } = gapFill(
    part.mesh,
    topo.adj,
    part.mesh.labels,
    topo.areas,
    get().gapArea,
  );
  if (!tris.length) return notify('info', 'Kapatılacak boşluk bulunamadı.');
  const byLabel = new Map<number, number[]>();
  tris.forEach((t, i) => {
    const list = byLabel.get(newLabels[i]);
    if (list) list.push(t);
    else byLabel.set(newLabels[i], [t]);
  });
  beginStroke(part.id, 'Gap Fill');
  for (const [label, list] of byLabel) applyLabels(part, list, label);
  endStroke();
  notify('info', `${tris.length} üçgen komşu renge çevrildi.`);
}

/**
 * B6: aktif slotun seçili parçadaki sınırını düzgün bir eğriye oturtur.
 * Alan korunur (tekrar basmak bölgeyi daraltmaz); içe/dışa kararı eğriden
 * okunur. Başka slota boyanmış üçgenler bölgeye katılmaz; bölgeden çıkanlar
 * komşularındaki en sık diğer etiketi alır. Sınır köşeleri eğriye çekildiği
 * için parça yeni mesh'le değiştirilir (geri alınabilir).
 */
export function smoothActiveRegion(): void {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  const slot = get().activeSlot;
  if (slot === BASE_SLOT) return notify('warn', 'Yumuşatmak için boyalı bir slot seçin.');
  const labels = part.mesh.labels;
  if (!labels.includes(slot)) return notify('warn', 'Bu slotta boyalı üçgen yok.');
  const topo = topologyOf(part.mesh);
  const { smoothRadius, smoothExact } = get();
  const radius = smoothRadius > 0 ? smoothRadius : smartOptions(topo).scale;
  let diff: SplitDiff | null = null;
  const r = smoothRegionBoundary(
    part.mesh,
    topo.adj,
    slot,
    radius,
    (t) => labels[t] === BASE_SLOT,
    (t) => neighborLabel(topo.adj, labels, t, slot),
    smoothExact,
    (d) => {
      diff = d;
    },
  );
  if (diff) {
    lastSmart = null;
    applyMeshSplit(part.mesh, diff);
    return;
  }
  const mesh = r;
  const before = get().parts;
  const after = before.map((p) => (p.id === part.id ? { ...p, mesh } : p));
  lastSmart = null;
  set({ parts: after });
  pushHistory({ kind: 'parts', before, after }, 'Tüm sınırı yumuşat');
}

/** `t`'nin komşularında `exclude` dışındaki en sık etiket; yoksa taban. */
export function neighborLabel(
  adj: Int32Array,
  labels: Uint16Array,
  t: number,
  exclude: number,
): number {
  const counts = new Map<number, number>();
  for (let e = 0; e < 3; e++) {
    const n = adj[3 * t + e];
    if (n < 0 || labels[n] === exclude) continue;
    counts.set(labels[n], (counts.get(labels[n]) ?? 0) + 1);
  }
  let best = BASE_SLOT;
  let bestCount = 0;
  for (const [l, c] of counts) {
    if (c > bestCount) {
      best = l;
      bestCount = c;
    }
  }
  return best;
}

// ---------- bölgeler (C12) ----------

export interface IslandInfo {
  /** Çekirdekteki ada anahtarıyla aynı: bileşenin en küçük üçgen numarası. */
  key: number;
  area: number;
  center: Vec3;
}

let islandCache: { mesh: LabeledMesh; slot: number; version: number; list: IslandInfo[] } | null =
  null;

/** Seçili parçada aktif slotun bölgeleri (1 mm² altı kırıntılar hariç, çekirdekteki gibi). */
export function activeIslands(): IslandInfo[] {
  const part = selectedPart();
  const { activeSlot: slot, paintVersion } = get();
  if (!part || slot === BASE_SLOT) return [];
  if (
    islandCache &&
    islandCache.mesh === part.mesh &&
    islandCache.slot === slot &&
    islandCache.version === paintVersion
  ) {
    return islandCache.list;
  }
  const topo = topologyOf(part.mesh);
  const mask = Uint8Array.from(part.mesh.labels, (l) => (l === slot ? 1 : 0));
  const { component, count } = connectedComponents(mask.length, topo.adj, mask);
  const info = Array.from({ length: count }, () => ({ key: -1, area: 0, c: [0, 0, 0] as Vec3 }));
  for (let t = 0; t < mask.length; t++) {
    const k = component[t];
    if (k < 0) continue;
    const g = info[k];
    if (g.key < 0) g.key = t;
    const a = topo.areas[t];
    g.area += a;
    for (let j = 0; j < 3; j++) g.c[j] += topo.centroids[3 * t + j] * a;
  }
  const largest = Math.max(0, ...info.map((g) => g.area));
  const list = info
    .filter((g) => !(g.area < 1 && g.area < largest * 0.01))
    .map((g) => ({ key: g.key, area: g.area, center: g.c.map((x) => x / g.area) as Vec3 }));
  islandCache = { mesh: part.mesh, slot, version: paintVersion, list };
  return list;
}

// ---------- slotlar ----------

export function addSlot(): void {
  const slots = get().slots;
  const id = Math.max(...slots.map((s) => s.id)) + 1;
  set({ slots: [...slots, { id, name: `Renk ${id}`, color: nextSlotColor(id) }], activeSlot: id });
}

export function updateSlot(id: number, patch: { name?: string; color?: string }): void {
  set((s) => ({ slots: s.slots.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  for (const p of get().parts) onLabelsChanged?.(p.id);
}

/** Seçili parçada aktif slotun boyasını siler (yanlış seçimi temizlemek için). */
export function clearActiveSlot(): void {
  clearSlotPaint(get().activeSlot);
}

/**
 * Rengi listeden kaldırır. Taban kalır. Bu renkle boyanmış üçgenler tabana döner;
 * geri alma rengi ve boyayı birlikte getirir.
 */
export function removeSlot(id: number): void {
  if (id === BASE_SLOT) return;
  const beforeSlots = get().slots;
  const slot = beforeSlots.find((s) => s.id === id);
  if (!slot) return;
  const paints: { mesh: LabeledMesh; tris: Uint32Array }[] = [];
  for (const part of get().parts) {
    const labels = part.mesh.labels;
    const tris: number[] = [];
    for (let t = 0; t < labels.length; t++) if (labels[t] === id) tris.push(t);
    if (!tris.length) continue;
    for (const t of tris) labels[t] = BASE_SLOT;
    paints.push({ mesh: part.mesh, tris: Uint32Array.from(tris) });
    onLabelsChanged?.(part.id, tris);
  }
  const colorBefore = get()
    .parts.filter((p) => p.colorSlot === id)
    .map((p) => ({ id: p.id, colorSlot: p.colorSlot }));
  const activeBefore = get().activeSlot;
  const activeAfter = activeBefore === id ? BASE_SLOT : activeBefore;
  const afterSlots = beforeSlots.filter((s) => s.id !== id);
  pushHistory(
    {
      kind: 'removeSlot',
      slotId: id,
      beforeSlots,
      afterSlots,
      activeBefore,
      activeAfter,
      paints,
      colorBefore,
    },
    `Rengi kaldır: ${slot.name}`,
  );
  set((s) => ({
    slots: afterSlots,
    activeSlot: activeAfter,
    paintVersion: s.paintVersion + 1,
    parts: colorBefore.length
      ? s.parts.map((p) => (p.colorSlot === id ? { ...p, colorSlot: BASE_SLOT } : p))
      : s.parts,
  }));
}

/** Seçili parçada bu slotun boyasını siler. Slot listede kalır. */
export function clearSlotPaint(slot: number): void {
  const part = selectedPart();
  if (!part || slot === BASE_SLOT) return;
  const labels = part.mesh.labels;
  const tris: number[] = [];
  for (let t = 0; t < labels.length; t++) if (labels[t] === slot) tris.push(t);
  if (!tris.length) return notify('info', 'Bu slotta boyalı üçgen yok.');
  for (const t of tris) labels[t] = BASE_SLOT;
  lastSmart = null;
  pushHistory({
    kind: 'paint',
    mesh: part.mesh,
    tris: Uint32Array.from(tris),
    before: new Uint16Array(tris.length).fill(slot),
    after: new Uint16Array(tris.length).fill(BASE_SLOT),
    label: 'Seçimi temizle',
  });
  onLabelsChanged?.(part.id, tris);
  set((s) => ({ paintVersion: s.paintVersion + 1 }));
}
