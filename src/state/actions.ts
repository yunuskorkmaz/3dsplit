import { CutError, type CutOptions, type PinPlacement, seamSeparates } from '../core/cut';
import { boundingBox } from '../core/geometry';
import { regionInsideLoop, surfacePath, vertexNeighbors } from '../core/lasso';
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
  suggestFeatures,
} from '../core/paint';
import {
  applySplit,
  revertSplit,
  type SplitDiff,
  smoothBoundaryAt,
  smoothRegionBoundary,
  smoothStrokeSplit,
} from '../core/smooth';
import { mirrorPoint } from '../core/spatial';
import { connectedComponents } from '../core/topology';
import { BASE_SLOT, type LabeledMesh, type Vec3 } from '../core/types';
import { filamentColors, write3mfBambu } from '../io/bambu3mf';
import {
  downloadBytes,
  type ExportObject,
  write3mf,
  writeStl,
  writeStlZip,
} from '../io/exportFile';
import { importFile } from '../io/importFile';
import { PROJECT_EXTENSION, readProject, writeProject } from '../io/project';
import { geometry } from '../worker/client';
import {
  get,
  type HistoryEntry,
  newPartId,
  nextSlotColor,
  notify,
  type Part,
  pushHistory,
  reservePartIds,
  selectedPart,
  set,
  useStore,
} from './store';
import {
  concavityOf,
  gridOf,
  invalidateTopology,
  patchTopology,
  refreshGeometry,
  type Topology,
  topologyOf,
} from './topologyCache';

// ---------- dosya ----------

export async function importFiles(files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    if (file.name.toLowerCase().endsWith(PROJECT_EXTENSION)) {
      await openProject(file);
      continue;
    }
    await busy(`${file.name} yükleniyor…`, async () => {
      const objects = await importFile(file);
      for (const obj of objects) {
        const prepared = await geometry.prepare(obj.positions, obj.indices, obj.labels);
        if (obj.labels) ensurePaintSlots(prepared.mesh.labels, obj.filamentColors ?? []);
        const r = prepared.report;
        const fixes = [
          r.removedDegenerate && `${r.removedDegenerate} dejenere üçgen silindi`,
          r.removedDuplicate && `${r.removedDuplicate} tekrarlı üçgen silindi`,
          r.flippedTriangles && `${r.flippedTriangles} üçgenin yönü düzeltildi`,
          r.filledHoles && `${r.filledHoles} delik kapatıldı`,
        ].filter(Boolean);
        if (fixes.length) notify('info', `${obj.name}: ${fixes.join(', ')}.`);
        if (prepared.voxel) {
          notify(
            'warn',
            `${obj.name}: mesh bozuk olduğu için voxel onarım yapıldı (voksel ${prepared.voxel.voxelSize.toFixed(2)} mm; ${prepared.voxel.closedGap.toFixed(1)} mm'den küçük delikler kapandı, ince ayrıntı yumuşamış olabilir).`,
          );
        }
        if (!prepared.manifold) {
          notify(
            'warn',
            `${obj.name}: onarım sonrası mesh kapalı değil, kesim çalışmayabilir. ${prepared.error ?? ''}`,
          );
        }
        const part: Part = {
          id: newPartId(),
          name: obj.name,
          mesh: prepared.mesh,
          visible: true,
          badge: null,
          colorSlot: BASE_SLOT,
          manifold: prepared.manifold,
        };
        const before = get().parts;
        set({ parts: [...before, part], selectedPartId: part.id });
        pushHistory({ kind: 'parts', before, after: get().parts }, `Aç: ${part.name}`);
      }
    });
  }
}

/**
 * Seçili parçada aktif slot bölgesinin merkezi ve alan ağırlıklı ortalama
 * normali (Socket'in otomatik yönü). Bölge yoksa null.
 */
export function regionFrame(): { center: Vec3; normal: Vec3 } | null {
  const part = selectedPart();
  const slot = get().activeSlot;
  if (!part) return null;
  const topo = topologyOf(part.mesh);
  const labels = part.mesh.labels;
  const c: Vec3 = [0, 0, 0];
  const n: Vec3 = [0, 0, 0];
  let area = 0;
  for (let t = 0; t < labels.length; t++) {
    if (labels[t] !== slot) continue;
    const a = topo.areas[t];
    area += a;
    for (let k = 0; k < 3; k++) {
      c[k] += topo.centroids[3 * t + k] * a;
      n[k] += topo.normals[3 * t + k] * a;
    }
  }
  if (area === 0) return null;
  const len = Math.hypot(...n) || 1;
  return {
    center: [c[0] / area, c[1] / area, c[2] / area],
    normal: [n[0] / len, n[1] / len, n[2] / len],
  };
}

export function setSocketDirection(direction: Vec3 | null): void {
  set((s) => ({ cut: { ...s.cut, direction } }));
}

/** A4: parçalar, etiketler ve slotlar tek dosyada. */
export function saveProject(): void {
  const { parts, slots, activeSlot, selectedPartId } = get();
  if (!parts.length) return notify('warn', 'Kaydedilecek parça yok.');
  const name = parts.find((p) => p.badge !== 'source')?.name ?? 'proje';
  downloadBytes(
    writeProject({ parts, slots, activeSlot, selectedPartId }),
    `${name}${PROJECT_EXTENSION}`,
  );
}

async function openProject(file: File): Promise<void> {
  await busy(`${file.name} açılıyor…`, async () => {
    const data = readProject(new Uint8Array(await file.arrayBuffer()));
    reservePartIds(data.parts.map((p) => p.id));
    stroke = null;
    lastSmart = null;
    set({
      parts: data.parts,
      slots: data.slots,
      activeSlot: data.activeSlot,
      selectedPartId: data.selectedPartId,
      preview: null,
      previewActive: false,
      pins: [],
      selectedPin: -1,
      undoStack: [],
      redoStack: [],
    });
    notify('info', `${file.name}: ${data.parts.length} parça açıldı.`);
  });
}

/** Boyalı 3MF'teki filament numaraları için slot açar; renkleri 3MF'ten alır. */
function ensurePaintSlots(labels: Uint16Array, colors: string[]): void {
  let max = 0;
  for (let t = 0; t < labels.length; t++) if (labels[t] > max) max = labels[t];
  if (!max) return;
  const slots = [...get().slots];
  for (let id = 1; id <= max; id++) {
    const color = colors[id - 1];
    const existing = slots.findIndex((s) => s.id === id);
    if (existing < 0) slots.push({ id, name: `Filament ${id}`, color: color ?? nextSlotColor(id) });
    else if (color) slots[existing] = { ...slots[existing], color };
  }
  slots.sort((a, b) => a.id - b.id);
  set({ slots });
  notify('info', `Boyalı 3MF: ${max} filament rengi slotlara aktarıldı.`);
}

function exportObjects(): ExportObject[] {
  const { parts, slots } = get();
  return parts
    .filter((p) => p.visible && p.badge !== 'source')
    .map((p) => ({
      name: p.name,
      mesh: p.mesh,
      color: slots.find((s) => s.id === p.colorSlot)?.color ?? '#b0b0b0',
    }));
}

/** A3: Bambu Studio / OrcaSlicer projesi; aynı renkli parçalar aynı filamentte, parçalar plakaya dizili. */
export function export3mf(): void {
  const objs = exportObjects();
  if (!objs.length) return notify('warn', 'Dışa aktarılacak görünür parça yok.');
  const title = get().parts.find((p) => p.badge !== 'source')?.name ?? 'parts';
  downloadBytes(
    write3mfBambu(objs, {
      title,
      onLayout: ({ fits }) => {
        if (!fits)
          notify(
            'warn',
            "Parçalar 256 mm plakaya sığmadı; slicer'da birden fazla plakaya dağıtın.",
          );
      },
    }),
    `${title}.3mf`,
    'model/3mf',
  );
  // renkler dosyaya yazılamıyor (bkz. bambu3mf.ts): eşlemeyi kullanıcıya göster
  const slots = get().slots;
  const mapping = filamentColors(objs).map((c, i) => {
    const slot = slots.find((s) => s.color.toUpperCase() === c);
    return `Filament ${i + 1}: ${slot?.name ?? c}`;
  });
  notify('info', `3MF hazır. Bambu/Orca'da filamentlere renk ata — ${mapping.join(', ')}.`);
}

/** Herhangi bir slicer için düz çok nesneli 3MF (filament ataması yok). */
export function export3mfGeneric(): void {
  const objs = exportObjects();
  if (!objs.length) return notify('warn', 'Dışa aktarılacak görünür parça yok.');
  downloadBytes(write3mf(objs), 'parts-generic.3mf', 'model/3mf');
}

export function exportStlZip(): void {
  const objs = exportObjects();
  if (!objs.length) return notify('warn', 'Dışa aktarılacak görünür parça yok.');
  downloadBytes(writeStlZip(objs), 'parts.zip', 'application/zip');
}

export function exportPartStl(id: string): void {
  const p = get().parts.find((x) => x.id === id);
  if (p) downloadBytes(writeStl(p.mesh, p.name), `${p.name}.stl`, 'model/stl');
}

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
function mirrored(part: Part, point: Vec3): { point: Vec3; tri: number } | null {
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

function partById(id: string): Part | undefined {
  return get().parts.find((p) => p.id === id);
}

function applyLabels(part: Part, tris: ArrayLike<number>, label: number): void {
  const labels = part.mesh.labels;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    if (stroke && !stroke.before.has(t)) stroke.before.set(t, labels[t]);
    labels[t] = label;
  }
  set((s) => ({ paintVersion: s.paintVersion + 1, errorLoops: null }));
  onLabelsChanged?.(part.id, tris);
}

/** Konumu değişen üçgenleri viewport'ta yerinde güncellemek için kanca. */
export let onGeometryChanged: ((partId: string, tris: ArrayLike<number> | null) => void) | null =
  null;
export function setGeometryChangedHook(fn: typeof onGeometryChanged): void {
  onGeometryChanged = fn;
}

/** Viewport'un değişen üçgenleri yeniden boyaması için kanca. */
export let onLabelsChanged: ((partId: string, tris?: ArrayLike<number>) => void) | null = null;
export function setLabelsChangedHook(fn: typeof onLabelsChanged): void {
  onLabelsChanged = fn;
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
function neighborLabel(adj: Int32Array, labels: Uint16Array, t: number, exclude: number): number {
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

// ---------- yumuşatma fırçası ----------

/** Açık yumuşatma darbesi: mesh yerinde değişir, darbe başındaki hali geri alma farkı için saklanır. */
let smoothStroke: {
  partId: string;
  mesh: LabeledMesh;
  pos0: Float32Array;
  lab0: Uint16Array;
  path: Vec3[];
} | null = null;

/**
 * Yumuşatma darbesi başlar. Mesh kopyalanmaz: darbe boyunca yerinde değişir,
 * sonunda sadece değişen köşe ve üçgenler geri alma kaydına yazılır. (Her
 * darbede tam kopya saklamak ve ekran geometrisini baştan kurmak uzun
 * oturumlarda belleği doldurup grafik bağlamını düşürüyordu.)
 */
export function beginSmoothStroke(partId: string): boolean {
  const part = partById(partId);
  if (!part) return false;
  const slot = get().activeSlot;
  if (slot === BASE_SLOT) {
    notify('warn', 'Yumuşatmak için sınırı düzeltilecek slotu seçin.');
    return false;
  }
  lastSmart = null;
  smoothStroke = {
    partId,
    mesh: part.mesh,
    pos0: new Float32Array(part.mesh.positions),
    lab0: Uint16Array.from(part.mesh.labels),
    path: [],
  };
  return true;
}

export function smoothAt(point: Vec3, tri?: number): void {
  if (!smoothStroke) return;
  const { mesh, partId } = smoothStroke;
  const { activeSlot: slot, brushRadius, smoothStrength } = get();
  const labels = mesh.labels;
  const topo = topologyOf(mesh);
  const adj = topo.adj;
  // X42: aday üçgenler vurulan üçgenden yüzey üzerinde yayılarak (tüm mesh taranmaz);
  // darbe boyunca köşeler kaydığı için ağırlık merkezlerine pay bırakılır
  const reach = brushRadius * 1.5 + 2 * topo.meanEdge;
  const nearOf = (t: number | undefined, p: Vec3) =>
    t === undefined || t >= labels.length
      ? undefined
      : brushSelect(adj, topo.centroids, t, p, reach);
  const tris = smoothBoundaryAt(
    mesh,
    slot,
    point,
    brushRadius,
    smoothStrength,
    (t) => labels[t] === BASE_SLOT,
    (t) => neighborLabel(adj, labels, t, slot),
    nearOf(tri, point),
  );
  smoothStroke.path.push(point);
  const part = partById(partId);
  const m = part ? mirrored(part, point) : null;
  if (m) {
    smoothStroke.path.push(m.point);
    const more = smoothBoundaryAt(
      mesh,
      slot,
      m.point,
      brushRadius,
      smoothStrength,
      (t) => labels[t] === BASE_SLOT,
      (t) => neighborLabel(adj, labels, t, slot),
      nearOf(m.tri, m.point),
    );
    for (const t of more) tris.push(t);
  }
  if (tris.length && !finiteAt(mesh, tris)) {
    // güvenlik ağı: geçersiz konum oluştuysa darbeyi baştan geri al, ayrıntıyı kaydet
    const stroke = smoothStroke;
    if (stroke) {
      const moved: number[] = [];
      for (let v = 0; v < stroke.pos0.length / 3; v++) {
        for (let k = 0; k < 3; k++) {
          if (mesh.positions[3 * v + k] !== stroke.pos0[3 * v + k]) {
            moved.push(v);
            break;
          }
        }
      }
      mesh.positions.set(stroke.pos0);
      mesh.labels.set(stroke.lab0);
      smoothStroke = { ...stroke };
      // ekrandaki konumlar da geri yazılmalı; sadece sınır ağacını yenilemek eski (bozuk) konumu bırakırdı
      if (moved.length) onGeometryChanged?.(partId, trianglesOfVertices(mesh, moved));
      onGeometryChanged?.(partId, null);
      onLabelsChanged?.(partId);
    }
    console.error('Yumuşatma geçersiz konum üretti', {
      point,
      brushRadius,
      smoothStrength,
      slot,
      tris: tris.length,
    });
    notify(
      'error',
      'Yumuşatma geçersiz bir sonuç üretti ve geri alındı. Tekrarlarsa bildirin (konsolda ayrıntı var).',
    );
    return;
  }
  if (tris.length) onGeometryChanged?.(partId, tris);
}

/** Köşelere değen üçgenler (ekranda yeniden yazmak için). */
function trianglesOfVertices(mesh: LabeledMesh, verts: number[]): number[] {
  const set = new Set(verts);
  const out: number[] = [];
  for (let t = 0; t < mesh.labels.length; t++) {
    if (
      set.has(mesh.indices[3 * t]) ||
      set.has(mesh.indices[3 * t + 1]) ||
      set.has(mesh.indices[3 * t + 2])
    )
      out.push(t);
  }
  return out;
}

function finiteAt(mesh: LabeledMesh, tris: ArrayLike<number>): boolean {
  const { positions: p, indices: idx } = mesh;
  for (let i = 0; i < tris.length; i++) {
    for (let k = 0; k < 3; k++) {
      const v = 3 * idx[3 * tris[i] + k];
      if (!Number.isFinite(p[v]) || !Number.isFinite(p[v + 1]) || !Number.isFinite(p[v + 2]))
        return false;
    }
  }
  return true;
}

export function endSmoothStroke(): void {
  if (!smoothStroke) return;
  const { partId, mesh, pos0, lab0, path } = smoothStroke;
  smoothStroke = null;
  const verts: number[] = [];
  for (let v = 0; v < pos0.length / 3; v++) {
    if (
      pos0[3 * v] !== mesh.positions[3 * v] ||
      pos0[3 * v + 1] !== mesh.positions[3 * v + 1] ||
      pos0[3 * v + 2] !== mesh.positions[3 * v + 2]
    ) {
      verts.push(v);
    }
  }
  // güvenlik ağı: darbe sonunda geçersiz ya da fırçadan çok uzağa kaçmış köşe varsa darbe geri alınır
  // (model ekrandan sessizce kaybolmasın)
  const limit = Math.max(1, get().brushRadius) * 20;
  const badVert = verts.find((v) => {
    for (let k = 0; k < 3; k++) {
      const x = mesh.positions[3 * v + k];
      if (!Number.isFinite(x) || Math.abs(x - pos0[3 * v + k]) > limit) return true;
    }
    return false;
  });
  if (badVert !== undefined) {
    console.error('Yumuşatma darbesi geçersiz köşe üretti; geri alındı', {
      vertex: badVert,
      before: Array.from(pos0.subarray(3 * badVert, 3 * badVert + 3)),
      after: Array.from(mesh.positions.subarray(3 * badVert, 3 * badVert + 3)),
      brushRadius: get().brushRadius,
      moved: verts.length,
    });
    mesh.positions.set(pos0);
    mesh.labels.set(lab0);
    onGeometryChanged?.(partId, verts.length ? trianglesOfVertices(mesh, verts) : []);
    onGeometryChanged?.(partId, null);
    onLabelsChanged?.(partId);
    notify(
      'error',
      'Yumuşatma darbesi geçersiz bir sonuç üretti ve geri alındı (ayrıntı konsolda).',
    );
    return;
  }
  const tris: number[] = [];
  for (let t = 0; t < lab0.length; t++) if (lab0[t] !== mesh.labels[t]) tris.push(t);
  refreshGeometry(mesh, undefined, verts.length ? trianglesOfVertices(mesh, verts) : []);
  onGeometryChanged?.(partId, null);
  if (verts.length) bumpGeometry(mesh);
  if (!verts.length && !tris.length) return;
  const pick = (src: Float32Array) => {
    const out = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => {
      out.set(src.subarray(3 * v, 3 * v + 3), 3 * i);
    });
    return out;
  };
  pushHistory({
    label: 'Yumuşatma fırçası',
    kind: 'geometry',
    mesh,
    verts: Uint32Array.from(verts),
    posBefore: pick(pos0),
    posAfter: pick(mesh.positions),
    tris: Uint32Array.from(tris),
    labelsBefore: Uint16Array.from(tris, (t) => lab0[t]),
    labelsAfter: Uint16Array.from(tris, (t) => mesh.labels[t]),
  });
  set((s) => ({ paintVersion: s.paintVersion + 1 }));
  splitStroke(mesh, path);
}

/** X34: darbe izinde sınır üçgenlerin içinden geçirilir ("Üçgenleri böl" açıksa). */
function splitStroke(mesh: LabeledMesh, path: Vec3[]): void {
  const { smoothExact, activeSlot: slot, brushRadius, smoothStrength } = get();
  if (!smoothExact || !path.length) return;
  const adj = topologyOf(mesh).adj;
  const labels = mesh.labels;
  const diff = smoothStrokeSplit(
    mesh,
    slot,
    path,
    brushRadius,
    smoothStrength,
    (t) => labels[t] === BASE_SLOT,
    (t) => neighborLabel(adj, labels, t, slot),
  );
  if (diff && (diff.changedTris.length || diff.addedIndices.length)) applyMeshSplit(mesh, diff);
}

/**
 * Bölme farkını mesh'e yerinde uygular (dizi başvuruları değişir, nesne aynı
 * kalır: eski boyama/geometri geri alma kayıtları geçerli kalır) ve geri alma
 * kaydına sadece farkı yazar.
 */
function applyMeshSplit(mesh: LabeledMesh, diff: SplitDiff, record = true): void {
  replaceMeshArrays(mesh, applySplit(mesh, diff), diff);
  if (record) pushHistory({ kind: 'split', mesh, diff }, 'Kenarı üçgenlere işle');
}

/** `forward` verilirse fark ileri uygulandı: önbellekler yerinde güncellenir; yoksa atılır. */
function replaceMeshArrays(mesh: LabeledMesh, next: LabeledMesh, forward?: SplitDiff): void {
  mesh.positions = next.positions;
  mesh.indices = next.indices;
  mesh.labels = next.labels;
  if (forward) patchTopology(mesh, forward.changedTris, forward.baseTris);
  else invalidateTopology(mesh);
  bumpGeometry(mesh);
  // viewport geometrisi yeniden kurulsun: parça nesnesi yenilenir, mesh aynı kalır
  set((s) => ({
    parts: s.parts.map((p) => (p.mesh === mesh ? { ...p } : p)),
    paintVersion: s.paintVersion + 1,
  }));
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

// ---------- pimler ----------

let layoutSeq = 0;
let layoutTimer: ReturnType<typeof setTimeout> | null = null;

/** Pimlerin gerçek yerleşimini (otomatik boyut/yer dahil) worker'dan alır. */
async function refreshPinLayout(): Promise<void> {
  const seq = ++layoutSeq;
  const { cut, tool, previewActive, activeSlot } = get();
  const part = selectedPart();
  if (
    cut.mode !== 'keys' ||
    (tool !== 'pin' && !previewActive) ||
    !part ||
    activeSlot === BASE_SLOT
  ) {
    if (get().pinLayout.length) set({ pinLayout: [] });
    return;
  }
  const layout = await geometry.pinLayout(part.mesh, cutOptions());
  if (seq === layoutSeq) set({ pinLayout: layout });
}

useStore.subscribe((s, prev) => {
  if (
    s.cut === prev.cut &&
    s.pins === prev.pins &&
    s.tool === prev.tool &&
    s.previewActive === prev.previewActive &&
    s.activeSlot === prev.activeSlot &&
    s.selectedPartId === prev.selectedPartId &&
    s.paintVersion === prev.paintVersion &&
    s.parts === prev.parts
  )
    return;
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    layoutTimer = null;
    refreshPinLayout();
  }, 80);
});

/**
 * Pim aracında tıklama. Bir pimin üstüne (ekranda) tıklanırsa seçilir; pimler
 * otomatikse önce bulundukları yerde elle pime çevrilir. Shift+tık pimi siler.
 * Pim seçiliyken boşluğa tıklamak seçimi bırakır; seçili pim yokken yeni pim ekler.
 * Pime tıklandıysa sürüklemeyle yüzeyde taşımak için pim numarasını döndürür.
 */
export function pinClick(index: number, point: Vec3, shift: boolean): number {
  const { pins, pinLayout: layout, selectedPin } = get();
  if (index >= 0) {
    if (!pins.length) {
      // otomatik pimler: yerlerinde elle pime dönüşür (boyut otomatik kalır)
      const manual = layout.map((l) => ({ point: l.surface }));
      if (shift) {
        commitPins(
          manual.filter((_, i) => i !== index),
          'Pim sil',
          -1,
        );
        return -1;
      }
      commitPins(manual, 'Pimleri elle düzenle', index);
      return index;
    }
    if (shift) {
      removePin(index);
      return -1;
    }
    set({ selectedPin: index });
    return index;
  }
  if (shift) return -1;
  if (selectedPin >= 0) {
    set({ selectedPin: -1 });
    return -1;
  }
  commitPins([...pins, { point }], 'Pim ekle', pins.length);
  return -1;
}

/** Tutamakla taşıma/döndürme bitti: seçili pime yeni yer ve eksen yazılır. */
export function commitPinHandle(point: Vec3, axis: Vec3): void {
  const i = get().selectedPin;
  if (i < 0) return;
  const mode = get().pinGizmo;
  updatePin(
    i,
    mode === 'translate' ? { point } : { axis },
    mode === 'translate' ? 'Pim taşı' : 'Pim döndür',
  );
}

/**
 * Pim listesini değiştirir ve geçmişe yazar. Aynı adlı değişiklikler art
 * arda (1 s içinde) gelirse tek adımda birleşir: sürükleme ya da sayı
 * alanında kaydırma geçmişi yüzlerce adımla doldurmaz.
 */
export function commitPins(next: PinPlacement[], label: string, selected?: number): void {
  const { pins: before, undoStack, redoStack } = get();
  if (next === before) return;
  set(selected === undefined ? { pins: next } : { pins: next, selectedPin: selected });
  const last = undoStack[undoStack.length - 1];
  const now = Date.now();
  if (
    last?.kind === 'pins' &&
    last.label === label &&
    !redoStack.length &&
    now - (last.time ?? 0) < 1000
  ) {
    const merged = { ...last, after: next, time: now };
    set({ undoStack: [...undoStack.slice(0, -1), merged] });
    return;
  }
  pushHistory({ kind: 'pins', before, after: next, time: now }, label);
}

export function updatePin(index: number, patch: Partial<PinPlacement>, label = 'Pim ayarı'): void {
  commitPins(
    get().pins.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    label,
  );
}

export function removePin(index: number): void {
  commitPins(
    get().pins.filter((_, i) => i !== index),
    'Pim sil',
    -1,
  );
}

/** Elle konan pimleri siler, otomatik yerleşime döner. */
export function clearPins(): void {
  if (get().pins.length) commitPins([], 'Otomatiğe dön', -1);
}

// ---------- otomatik öneri (B9) ----------

/**
 * Seçili parçadaki çıkıntıları (göz, burun, kaş, kulak…) bulup her birini yeni
 * bir slota boyar. Büyükten küçüğe boyanır; iç içe olanlarda (ağız çevresi ve
 * burun) küçük olan üstte kalır. Önceden boyanmış yerlere dokunulmaz. Tek geri alma.
 */
export function autoSuggestFeatures(): void {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  const topo = topologyOf(part.mesh);
  const concavity = concavityOf(part.mesh, topo.meanEdge * 3);
  const found = suggestFeatures(topo.adj, topo.normals, topo.centroids, topo.areas, concavity, {
    meanEdge: topo.meanEdge,
    maxSeeds: 40,
    spacing: Math.max(2, topo.meanEdge * 10),
    areaRange: [0.0005, 0.15],
  });
  if (!found.length) return notify('info', 'Belirgin çıkıntı bulunamadı.');
  const slots = [...get().slots];
  let nextId = Math.max(...slots.map((s) => s.id)) + 1;
  const labels = part.mesh.labels;
  const ours = new Set<number>();
  beginStroke(part.id, 'Çıkıntıları öner');
  for (const tris of found) {
    const id = nextId++;
    slots.push({ id, name: `Öneri ${ours.size + 1}`, color: nextSlotColor(id) });
    ours.add(id);
    const free = Array.from(tris).filter((t) => labels[t] === BASE_SLOT || ours.has(labels[t]));
    applyLabels(part, free, id);
  }
  endStroke();
  set({ slots });
  notify(
    'info',
    `${found.length} çıkıntı önerildi. "temizle" boyayı siler, "kaldır" rengi listeden çıkarır.`,
  );
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

// ---------- kesim ----------

function cutOptions(): CutOptions {
  const { cut, activeSlot, pins } = get();
  return {
    mode: cut.mode,
    slot: activeSlot,
    depth: cut.mode === 'socket' ? cut.depth : 0,
    depthByIsland: cut.mode === 'socket' && !cut.linkAll ? cut.islandDepths : undefined,
    clearance: cut.clearance,
    squeeze: cut.mode === 'socket' ? cut.squeeze : 0,
    inset: cut.mode === 'socket' ? cut.inset : 0,
    ringProfile: cut.mode === 'socket' ? cut.ringProfile : undefined,
    planar: cut.mode !== 'socket' && cut.planar,
    smoothEdge: cut.smoothEdge,
    minWall: cut.minWall,
    direction: cut.mode === 'socket' && cut.direction ? cut.direction : undefined,
    pin: {
      shape: cut.pinShape,
      radius: cut.pinRadius,
      length: cut.pinLength,
      onPart: cut.pinOnPart,
      depthClearance: cut.pinDepthClearance,
      chamfer: cut.pinChamfer,
      bodyRatio: cut.pinBodyRatio,
      auto: cut.pinAuto,
    },
    pins: cut.mode === 'keys' ? pins : undefined,
    faceGap: cut.faceGap,
  };
}

/**
 * Geometri anahtarı: mesh nesnesi + konum sürümü. Worker aynı anahtarda
 * modelin manifold'unu yeniden kullanır. Konumlar yerinde değişince
 * (yumuşatma fırçası, geri alma) sürüm artar.
 */
const meshIds = new WeakMap<LabeledMesh, number>();
const geomVersions = new WeakMap<LabeledMesh, number>();
let meshCounter = 0;
function geomKey(mesh: LabeledMesh): string {
  let id = meshIds.get(mesh);
  if (id === undefined) {
    id = ++meshCounter;
    meshIds.set(mesh, id);
  }
  return `${id}:${geomVersions.get(mesh) ?? 0}`;
}
function bumpGeometry(mesh: LabeledMesh): void {
  geomVersions.set(mesh, (geomVersions.get(mesh) ?? 0) + 1);
}

function cutTarget(): Part | null {
  const part = selectedPart();
  if (!part) {
    notify('warn', 'Önce bir parça seçin.');
    return null;
  }
  if (get().activeSlot === BASE_SLOT) {
    notify('warn', 'Taban slotu kesilemez; kesilecek bölgenin slotunu seçin.');
    return null;
  }
  return part;
}

let suggestTimer: ReturnType<typeof setTimeout> | null = null;
let suggestSeq = 0;

/** X5: boyama durulunca aktif slot bölgesi için kesim modu önerisini (Worker'da) yeniler. */
export function scheduleSuggestion(): void {
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    const part = selectedPart();
    const slot = get().activeSlot;
    const seq = ++suggestSeq;
    if (!part || slot === BASE_SLOT || !part.mesh.labels.includes(slot)) {
      set({ suggestion: null });
      return;
    }
    try {
      const s = await geometry.suggest(part.mesh, slot);
      if (seq === suggestSeq) set({ suggestion: s });
    } catch {
      if (seq === suggestSeq) set({ suggestion: null });
    }
  }, 400);
}

/**
 * Önizleme modunu açar/kapatır. Açıkken ayar, pim, slot, boyama veya parça
 * değişince önizleme kendiliğinden yenilenir (pim sürüklerken de açık kalır).
 */
function seamReady(): { part: Part; loop: number[] } | null {
  const line = get().line;
  if (get().tool !== 'seam' || !line.closed || line.bad || line.path.length < 3) return null;
  const part = line.partId ? get().parts.find((p) => p.id === line.partId) : undefined;
  return part ? { part, loop: line.path } : null;
}

function seamOptions(loop: number[]): CutOptions {
  const mode = get().cut.mode === 'keys' ? 'keys' : 'fast';
  return { ...cutOptions(), mode, seamLoop: loop };
}

export async function togglePreview(): Promise<void> {
  if (get().previewActive) return set({ previewActive: false, preview: null });
  if (!seamReady() && !cutTarget()) return;
  set({ previewActive: true });
  await refreshPreview(true);
}

let previewSeq = 0;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

/** Önizlemeyi yeniden hesaplar; `loud` ise hazırlanırken meşgul gösterilir. */
async function refreshPreview(loud = false): Promise<void> {
  const part = selectedPart();
  const seq = ++previewSeq;
  if (!get().previewActive) return;
  const seam = seamReady();
  if (
    !seam &&
    (!part || get().activeSlot === BASE_SLOT || !part.mesh.labels.includes(get().activeSlot))
  ) {
    set({ preview: null });
    return;
  }
  const target = seam?.part ?? part;
  if (!target) return;
  const run = async () => {
    try {
      const p = await geometry.preview(
        target.mesh,
        seam ? seamOptions(seam.loop) : cutOptions(),
        geomKey(target.mesh),
      );
      // bu arada yeni istek geldiyse ya da mod kapandıysa eski sonucu gösterme
      if (seq !== previewSeq || !get().previewActive) return;
      if (loud) for (const w of p.warnings) notify('warn', w);
      set({ preview: p });
    } catch (e) {
      if (seq !== previewSeq) return;
      notify('error', `Önizleme: ${e instanceof Error ? e.message : String(e)}`);
      set({ preview: null });
    }
  };
  if (loud) await busy('Önizleme hazırlanıyor…', run);
  else await run();
}

/** Önizleme açıkken girdiler değişince kısa gecikmeyle yenile (sürüklemede her adımda değil). */
useStore.subscribe((s, prev) => {
  if (!s.previewActive) return;
  if (
    s.cut === prev.cut &&
    s.pins === prev.pins &&
    s.activeSlot === prev.activeSlot &&
    s.selectedPartId === prev.selectedPartId &&
    s.paintVersion === prev.paintVersion &&
    s.parts === prev.parts &&
    s.line === prev.line &&
    s.tool === prev.tool
  )
    return;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    refreshPreview();
  }, 300);
});

export async function runCut(): Promise<void> {
  const seam = seamReady();
  if (get().tool === 'seam') {
    if (!seam) return notify('warn', 'Önce dikiş halkasını kapatın.');
    return runSeamCut(seam.part, seam.loop);
  }
  const part = cutTarget();
  if (!part) return;
  const opts = cutOptions();
  await busy('Kesiliyor…', async () => {
    const r = await geometry.cut(part.mesh, opts, geomKey(part.mesh));
    if (!r.ok) {
      set({ errorLoops: r.loops.length ? r.loops : null });
      notify('error', r.loops.length ? `${r.error} Sorunlu sınır kırmızıyla gösterildi.` : r.error);
      return;
    }
    set({ errorLoops: null });
    for (const w of r.warnings) notify('warn', w);
    const slotName = get().slots.find((s) => s.id === opts.slot)?.name ?? `Slot ${opts.slot}`;
    const newParts: Part[] = [
      {
        id: newPartId(),
        name: `${part.name} gövde`,
        mesh: r.body,
        visible: true,
        badge: 'new',
        colorSlot: part.colorSlot,
        manifold: true,
      },
      ...r.parts.map((mesh: LabeledMesh, i: number) => ({
        id: newPartId(),
        name: `${part.name} ${slotName}${r.parts.length > 1 ? ` ${i + 1}` : ''}`,
        mesh,
        visible: true,
        badge: 'new' as const,
        colorSlot: opts.slot,
        manifold: true,
      })),
    ];
    const before = get().parts;
    const after = before.flatMap((p) => {
      const cleared = p.badge === 'new' ? { ...p, badge: null } : p;
      return p.id === part.id
        ? [{ ...p, badge: 'source' as const, visible: false }, ...newParts]
        : [cleared];
    });
    // yön ve pimler bölgeye özgü: sonraki kesim otomatikten başlar
    set((s) => ({
      parts: after,
      selectedPartId: newParts[0].id,
      preview: null,
      pins: [],
      selectedPin: -1,
      directionGizmo: false,
      cut: { ...s.cut, direction: null, islandDepths: {}, ringProfile: [0, 0, 0, 0, 0, 0, 0, 0] },
    }));
    pushHistory(
      { kind: 'parts', before, after },
      `Kes (${opts.mode === 'socket' ? 'Tapa' : opts.mode === 'keys' ? 'Pimli kes' : 'Yapıştır'})`,
    );
    set({ previewActive: false, preview: null });
    notify('info', `Kesildi: ${newParts.length} yeni parça. Kaynak parça gizlendi (sarı rozet).`);
  });
}

async function runSeamCut(part: Part, loop: number[]): Promise<void> {
  const opts = seamOptions(loop);
  await busy('Kesiliyor…', async () => {
    const r = await geometry.cut(part.mesh, opts, geomKey(part.mesh));
    if (!r.ok) {
      set({ errorLoops: r.loops.length ? r.loops : null, line: { ...get().line, bad: true } });
      notify('error', r.loops.length ? `${r.error} Halka kırmızıyla gösterildi.` : r.error);
      return;
    }
    set({ errorLoops: null });
    for (const w of r.warnings) notify('warn', w);
    const newParts: Part[] = [
      {
        id: newPartId(),
        name: `${part.name} gövde`,
        mesh: r.body,
        visible: true,
        badge: 'new',
        colorSlot: part.colorSlot,
        manifold: true,
      },
      ...r.parts.map((mesh: LabeledMesh) => ({
        id: newPartId(),
        name: `${part.name} parça`,
        mesh,
        visible: true,
        badge: 'new' as const,
        colorSlot: part.colorSlot,
        manifold: true,
      })),
    ];
    const before = get().parts;
    const after = before.flatMap((p) => {
      const cleared = p.badge === 'new' ? { ...p, badge: null } : p;
      return p.id === part.id
        ? [{ ...p, badge: 'source' as const, visible: false }, ...newParts]
        : [cleared];
    });
    set((s) => ({
      parts: after,
      selectedPartId: newParts[0].id,
      preview: null,
      pins: [],
      selectedPin: -1,
      directionGizmo: false,
      cut: { ...s.cut, direction: null, islandDepths: {}, ringProfile: [0, 0, 0, 0, 0, 0, 0, 0] },
    }));
    lineCancel();
    pushHistory({ kind: 'parts', before, after }, 'Kes (Dikiş)');
    set({ previewActive: false, preview: null });
    notify(
      'info',
      opts.mode === 'keys'
        ? 'Dikiş kesildi, kesite pim kondu. Kaynak parça gizlendi.'
        : 'Dikiş kesildi, yapıştırmalık iki parça. Kaynak parça gizlendi.',
    );
  });
}

export async function refineSelected(): Promise<void> {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  if (!part.manifold) return notify('warn', 'Parça kapalı mesh değil; inceltilemez.');
  const edge = get().refineEdge;
  await busy('İnceltiliyor…', async () => {
    const mesh = await geometry.refine(part.mesh, edge);
    const before = get().parts;
    const after = before.map((p) => (p.id === part.id ? { ...p, mesh } : p));
    set({ parts: after });
    pushHistory({ kind: 'parts', before, after }, 'İncelt');
    notify('info', `${part.name}: ${part.mesh.labels.length} → ${mesh.labels.length} üçgen.`);
  });
}

/** A2: seçili parçayı voxel onarımla kapalı hale getirir (bozuk / "!" rozetli parçalar için). */
export async function voxelRepairSelected(resolution = 200): Promise<void> {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  await busy('Voxel onarım…', async () => {
    const r = await geometry.voxel(part.mesh, resolution);
    const before = get().parts;
    const after = before.map((p) =>
      p.id === part.id ? { ...p, mesh: r.mesh, manifold: true } : p,
    );
    set({ parts: after });
    pushHistory({ kind: 'parts', before, after }, 'Voxel onar');
    notify(
      'info',
      `${part.name}: voxel onarım (voksel ${r.voxelSize.toFixed(2)} mm), ${r.mesh.labels.length} üçgen.`,
    );
  });
}

export async function splitSelected(): Promise<void> {
  const part = selectedPart();
  if (!part) return notify('warn', 'Önce bir parça seçin.');
  await busy('Bölünüyor…', async () => {
    const pieces = await geometry.split(part.mesh);
    if (pieces.length <= 1) return notify('info', 'Parça zaten tek parça.');
    const newParts: Part[] = pieces.map((mesh: LabeledMesh, i: number) => ({
      ...part,
      id: newPartId(),
      name: `${part.name} ${i + 1}`,
      mesh,
      badge: 'new' as const,
      visible: true,
    }));
    const before = get().parts;
    const after = before.flatMap((p) => (p.id === part.id ? newParts : [p]));
    set({ parts: after, selectedPartId: newParts[0].id });
    pushHistory({ kind: 'parts', before, after }, 'Kopukları ayır');
    notify('info', `${pieces.length} parçaya bölündü.`);
  });
}

/**
 * X35: tolerans deneme parçası. Seçili boşluğun 0.1 mm altı, kendisi ve
 * 0.1 mm üstüyle delikli plaka + pimler; modelin yanına yeni parça olarak
 * eklenir. Keys'te pim ayarları, Socket'te 4 mm yarıçaplı silindir tapa
 * (boyu derinliğin iki katı) kullanılır.
 */
export async function makeToleranceCoupon(): Promise<void> {
  const { cut } = get();
  const c = cut.clearance;
  const clearances = [
    ...new Set([Math.max(0, c - 0.1), c, c + 0.1].map((x) => Math.round(x * 100) / 100)),
  ];
  const pin =
    cut.mode === 'keys'
      ? {
          shape: cut.pinShape,
          radius: cut.pinRadius,
          length: cut.pinLength,
          onPart: true,
          chamfer: cut.pinChamfer,
        }
      : {
          shape: 'cylinder' as const,
          radius: 4,
          length: 2 * cut.depth,
          onPart: true,
          chamfer: 0.4,
        };
  const depthClearance = cut.mode === 'keys' ? cut.pinDepthClearance : c;
  await busy('Deneme parçası hazırlanıyor…', async () => {
    const coupon = await geometry.coupon(pin, clearances, depthClearance);
    // görünür parçaların sağına yerleştir
    const visible = get().parts.filter((p) => p.visible);
    let maxX = 0;
    let minY = 0;
    for (const p of visible) {
      const b = boundingBox(p.mesh.positions);
      maxX = Math.max(maxX, b.max[0]);
      minY = Math.min(minY, b.min[1]);
    }
    const shift = (m: LabeledMesh) => {
      for (let i = 0; i < m.positions.length; i += 3) {
        m.positions[i] += maxX + 10;
        m.positions[i + 1] += minY;
      }
      return m;
    };
    const label = clearances.join(' / ');
    const make = (mesh: LabeledMesh, name: string): Part => ({
      id: newPartId(),
      name,
      mesh: shift(mesh),
      visible: true,
      badge: 'new',
      colorSlot: BASE_SLOT,
      manifold: true,
    });
    const newParts = [
      make(coupon.plate, `Tolerans plakası (${label} mm)`),
      ...coupon.pins.map((m, i) => make(m, `Tolerans pimi ${i + 1}`)),
    ];
    const before = get().parts;
    const after = [...before, ...newParts];
    set({ parts: after });
    pushHistory({ kind: 'parts', before, after }, 'Deneme parçası');
    notify(
      'info',
      `Deneme parçası eklendi: boşluklar soldan sağa ${label} mm (deliğin önündeki çentik sayısı: 1, 2, 3). Pimleri takıp en iyi oturanı seçin; bu parçaları dışa aktarırken sadece onları görünür bırakın.`,
    );
  });
}

// ---------- çizgi aracı (X36) ----------

/** Tıklanan noktaya en yakın üçgen köşesi. */
function nearestCorner(mesh: LabeledMesh, tri: number, p: Vec3): number {
  let best = mesh.indices[3 * tri];
  let bd = Infinity;
  for (let k = 0; k < 3; k++) {
    const v = mesh.indices[3 * tri + k];
    const d = Math.hypot(
      mesh.positions[3 * v] - p[0],
      mesh.positions[3 * v + 1] - p[1],
      mesh.positions[3 * v + 2] - p[2],
    );
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

const neighborCache = new WeakMap<Uint32Array, { start: Uint32Array; list: Uint32Array }>();
function neighborsOf(mesh: LabeledMesh) {
  let n = neighborCache.get(mesh.indices);
  if (!n) {
    n = vertexNeighbors(mesh);
    neighborCache.set(mesh.indices, n);
  }
  return n;
}

/** Çizgi aracı tıklaması: nokta ekler; ilk noktaya yakınsa halkayı kapatır. */
export function lineClick(partId: string, tri: number, point: Vec3): void {
  const part = partById(partId);
  if (!part) return;
  let line = get().line;
  if (line.partId !== partId || line.closed) line = { partId, anchors: [], path: [] };
  const mesh = part.mesh;
  const v = nearestCorner(mesh, tri, point);
  if (line.anchors.length >= 3) {
    const first = line.anchors[0];
    const d = Math.hypot(
      mesh.positions[3 * v] - mesh.positions[3 * first],
      mesh.positions[3 * v + 1] - mesh.positions[3 * first + 1],
      mesh.positions[3 * v + 2] - mesh.positions[3 * first + 2],
    );
    if (v === first || d < Math.max(3 * topologyOf(mesh).meanEdge, get().brushRadius / 2)) {
      set({ line });
      lineClose();
      return;
    }
  }
  if (!line.anchors.length) {
    set({ line: { partId, anchors: [v], path: [v] } });
    return;
  }
  const seg = surfacePath(mesh, neighborsOf(mesh), line.anchors[line.anchors.length - 1], v);
  if (!seg.length) return notify('warn', 'Bu noktaya yüzey üzerinden yol yok (başka kopuk parça).');
  set({ line: { partId, anchors: [...line.anchors, v], path: [...line.path, ...seg.slice(1)] } });
}

/** Çizgi aracının ekranda gösterilecek yolu ve noktaları. */
export function linePreview(): { path: Vec3[]; anchors: Vec3[]; size: number } {
  const line = get().line;
  const part = line.partId ? partById(line.partId) : undefined;
  if (!part) return { path: [], anchors: [], size: 1 };
  const p = part.mesh.positions;
  const at = (v: number): Vec3 => [p[3 * v], p[3 * v + 1], p[3 * v + 2]];
  return {
    path: line.path.map(at),
    anchors: line.anchors.map(at),
    size: Math.max(0.2, topologyOf(part.mesh).meanEdge * 1.5),
  };
}

/** Son noktayı geri alır. */
export function lineUndo(): void {
  const line = get().line;
  const part = line.partId ? partById(line.partId) : undefined;
  if (!part || line.anchors.length <= 1) return lineCancel();
  const anchors = line.anchors.slice(0, -1);
  // yolu baştan kur (segmentler kısa, ucuz)
  let path = [anchors[0]];
  for (let i = 1; i < anchors.length; i++)
    path = [
      ...path,
      ...surfacePath(part.mesh, neighborsOf(part.mesh), anchors[i - 1], anchors[i]).slice(1),
    ];
  set({ line: { ...line, anchors, path } });
}

export function lineCancel(): void {
  set({ line: { partId: null, anchors: [], path: [] } });
}

/**
 * Halkayı kapatır, içini aktif slota boyar ve sınırı çizgi boyunca
 * düzleştirip üçgenlerin içinden geçirir (kenar yolunun zikzakı gider).
 * Başka slota boyalı üçgenler değişmez.
 */
export function lineClose(): void {
  const line = get().line;
  const part = line.partId ? partById(line.partId) : undefined;
  if (!part || line.anchors.length < 3) return notify('warn', 'Halka için en az 3 nokta gerekli.');
  if (get().tool === 'seam') return finishSeam(part, line);
  const slot = get().activeSlot;
  if (slot === BASE_SLOT) return notify('warn', 'Boyanacak slotu seçin (taban değil).');
  const mesh = part.mesh;
  const nbr = neighborsOf(mesh);
  const closeLoop = (anchors: number[], path: number[]) => [
    ...path,
    ...surfacePath(mesh, nbr, anchors[anchors.length - 1], anchors[0]).slice(1, -1),
  ];
  const loops = [closeLoop(line.anchors, line.path)];
  // X44: ayna açıksa karşı tarafta da aynı halka
  const at = (v: number): Vec3 => [
    mesh.positions[3 * v],
    mesh.positions[3 * v + 1],
    mesh.positions[3 * v + 2],
  ];
  const mirroredAnchors = line.anchors.map((v) => {
    const m = mirrored(part, at(v));
    return m ? nearestCorner(mesh, m.tri, m.point) : -1;
  });
  if (get().mirror.enabled) {
    if (mirroredAnchors.includes(-1)) {
      notify('warn', 'Aynadaki karşılık yüzeyde bulunamadı; sadece çizilen halka boyandı.');
    } else if (!mirroredAnchors.every((v, i) => v === line.anchors[i])) {
      let path = [mirroredAnchors[0]];
      for (let i = 1; i < mirroredAnchors.length; i++) {
        path = [
          ...path,
          ...surfacePath(mesh, nbr, mirroredAnchors[i - 1], mirroredAnchors[i]).slice(1),
        ];
      }
      loops.push(closeLoop(mirroredAnchors, path));
    }
  }
  const topo = topologyOf(mesh);
  const tris: number[] = [];
  for (const loop of loops) {
    const inside = regionInsideLoop(mesh, topo.adj, topo.areas, loop);
    if (!inside) {
      notify('warn', 'Çizgi yüzeyi iki parçaya ayırmıyor; halkayı kontrol edin.');
      continue;
    }
    for (let t = 0; t < inside.length; t++)
      if (inside[t] && mesh.labels[t] === BASE_SLOT) tris.push(t);
  }
  const unique = [...new Set(tris)];
  if (!unique.length) return;
  const before = Uint16Array.from(unique, (t) => mesh.labels[t]);
  for (const t of unique) mesh.labels[t] = slot;
  pushHistory({
    kind: 'paint',
    mesh,
    tris: Uint32Array.from(unique),
    before,
    after: new Uint16Array(unique.length).fill(slot),
    label: 'Çizgi',
  });
  onLabelsChanged?.(part.id, unique);
  lineCancel();
  // zikzakı düzelt: çizgi boyunca yumuşatıp üçgenlerin içinden geçir
  const pts: Vec3[] = loops.flatMap((loop) => [...loop, loop[0]].map(at));
  const labels = mesh.labels;
  const radius = Math.max(3 * topo.meanEdge, get().smoothRadius || 0);
  const diff = smoothStrokeSplit(
    mesh,
    slot,
    pts,
    radius,
    1,
    (t) => labels[t] === BASE_SLOT,
    (t) => neighborLabel(topo.adj, labels, t, slot),
  );
  if (diff && (diff.changedTris.length || diff.addedIndices.length)) applyMeshSplit(mesh, diff);
  else set((s) => ({ paintVersion: s.paintVersion + 1 }));
  notify(
    'info',
    `Çizgi kapatıldı: ${unique.length} üçgen boyandı${loops.length > 1 ? ' (aynayla iki halka)' : ''}.`,
  );
}

function finishSeam(
  part: Part,
  line: { partId: string | null; anchors: number[]; path: number[] },
): void {
  const mesh = part.mesh;
  const nbr = neighborsOf(mesh);
  const loop = [
    ...line.path,
    ...surfacePath(mesh, nbr, line.anchors[line.anchors.length - 1], line.anchors[0]).slice(1, -1),
  ];
  try {
    const kind = seamSeparates(mesh, loop);
    set({ line: { ...line, path: loop, closed: true, bad: false }, errorLoops: null });
    notify(
      'info',
      kind === 'surface'
        ? 'Dikiş hazır. Çizgi düz değil; Kes, çizilen halkayı izler.'
        : get().cut.mode === 'keys'
          ? 'Dikiş hazır. Kes, bu düzlemden ayırır ve kesite pim koyar.'
          : 'Dikiş hazır. Kes, yapıştırmalık iki parça ayırır. Pim için üstten Pimli kes’i seçin.',
    );
  } catch (e) {
    const loops = e instanceof CutError ? (e.loops ?? []) : [];
    set({
      line: { ...line, path: loop, closed: true, bad: true },
      errorLoops: loops.length ? loops : null,
    });
    notify('error', e instanceof Error ? e.message : String(e));
  }
}

// ---------- parça yönetimi ----------

export function selectPart(id: string): void {
  set({ selectedPartId: id });
}

export function toggleVisible(id: string): void {
  set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)) }));
}

/** X27: yalnız bu parça görünsün; zaten yalnızsa kaynak dışındaki tüm parçalar geri gelir. */
export function soloPart(id: string): void {
  const parts = get().parts;
  const alone = parts.every((p) => p.visible === (p.id === id));
  if (alone) {
    set({ parts: parts.map((p) => ({ ...p, visible: p.badge !== 'source' || p.id === id })) });
    return;
  }
  set({
    parts: parts.map((p) => ({ ...p, visible: p.id === id })),
    selectedPartId: id,
  });
}

/** Kesimden önceki kaynak parçalar hariç hepsini gösterir (kaynak yalnızsa o da gösterilir). */
export function showAllParts(): void {
  const parts = get().parts;
  const onlySources = parts.every((p) => p.badge === 'source');
  set({ parts: parts.map((p) => ({ ...p, visible: onlySources || p.badge !== 'source' })) });
}

export function hideSelectedPart(): void {
  const id = get().selectedPartId;
  if (id)
    set((s) => ({
      parts: s.parts.map((p) => (p.id === id ? { ...p, visible: false } : p)),
    }));
}

export function toggleExplode(): void {
  set((s) => ({ explode: s.explode > 0 ? 0 : 0.6 }));
}

export function deletePart(id: string): void {
  const before = get().parts;
  const after = before.filter((p) => p.id !== id);
  set((s) => ({
    parts: after,
    selectedPartId: s.selectedPartId === id ? (after[0]?.id ?? null) : s.selectedPartId,
  }));
  pushHistory({ kind: 'parts', before, after }, 'Parça sil');
}

export function renamePart(id: string, name: string): void {
  set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, name } : p)) }));
}

// ---------- geri al / yinele ----------

function applyEntry(entry: HistoryEntry, reverse: boolean): void {
  if (entry.kind === 'paint') {
    const values = reverse ? entry.before : entry.after;
    for (let i = 0; i < entry.tris.length; i++) entry.mesh.labels[entry.tris[i]] = values[i];
    const part = get().parts.find((p) => p.mesh === entry.mesh);
    if (part) onLabelsChanged?.(part.id, entry.tris);
    set((s) => ({ paintVersion: s.paintVersion + 1 }));
  } else if (entry.kind === 'pins') {
    set({ pins: reverse ? entry.before : entry.after, selectedPin: -1 });
  } else if (entry.kind === 'split') {
    if (reverse) replaceMeshArrays(entry.mesh, revertSplit(entry.mesh, entry.diff));
    else replaceMeshArrays(entry.mesh, applySplit(entry.mesh, entry.diff), entry.diff);
  } else if (entry.kind === 'removeSlot') {
    const slots = reverse ? entry.beforeSlots : entry.afterSlots;
    const activeSlot = reverse ? entry.activeBefore : entry.activeAfter;
    for (const paint of entry.paints) {
      const value = reverse ? entry.slotId : BASE_SLOT;
      for (const t of paint.tris) paint.mesh.labels[t] = value;
      const part = get().parts.find((p) => p.mesh === paint.mesh);
      if (part) onLabelsChanged?.(part.id, [...paint.tris]);
    }
    set((s) => ({
      slots,
      activeSlot,
      paintVersion: s.paintVersion + 1,
      parts: s.parts.map((p) => {
        const prev = entry.colorBefore.find((c) => c.id === p.id);
        if (!prev) return p;
        return { ...p, colorSlot: reverse ? prev.colorSlot : BASE_SLOT };
      }),
    }));
  } else if (entry.kind === 'geometry') {
    const pos = reverse ? entry.posBefore : entry.posAfter;
    const lab = reverse ? entry.labelsBefore : entry.labelsAfter;
    entry.verts.forEach((v, i) => {
      entry.mesh.positions.set(pos.subarray(3 * i, 3 * i + 3), 3 * v);
    });
    if (entry.verts.length) bumpGeometry(entry.mesh);
    entry.tris.forEach((t, i) => {
      entry.mesh.labels[t] = lab[i];
    });
    refreshGeometry(entry.mesh);
    const part = get().parts.find((p) => p.mesh === entry.mesh);
    if (part) {
      // köşesi değişen üçgenler de yeniden yazılır
      const touched = new Set<number>(entry.tris);
      const moved = new Set<number>(entry.verts);
      const idx = entry.mesh.indices;
      for (let t = 0; t < idx.length / 3; t++) {
        if (moved.has(idx[3 * t]) || moved.has(idx[3 * t + 1]) || moved.has(idx[3 * t + 2]))
          touched.add(t);
      }
      onGeometryChanged?.(part.id, [...touched]);
      onGeometryChanged?.(part.id, null);
    }
    set((s) => ({ paintVersion: s.paintVersion + 1 }));
  } else {
    const parts = reverse ? entry.before : entry.after;
    set((s) => ({
      parts,
      selectedPartId: parts.some((p) => p.id === s.selectedPartId)
        ? s.selectedPartId
        : (parts[0]?.id ?? null),
    }));
  }
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

/** Geçmişte `undoCount` kayıt uygulanmış duruma gider (geri al / yinele tekrarı). */
export function jumpToHistory(undoCount: number): void {
  while (get().undoStack.length > undoCount) undo();
  while (get().undoStack.length < undoCount && get().redoStack.length) redo();
}

export function undo(): void {
  const stack = get().undoStack;
  const entry = stack[stack.length - 1];
  if (!entry) return;
  lastSmart = null;
  set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] }));
  applyEntry(entry, true);
}

export function redo(): void {
  const stack = get().redoStack;
  const entry = stack[stack.length - 1];
  if (!entry) return;
  set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, entry] }));
  applyEntry(entry, false);
}

// ---------- yardımcı ----------

async function busy(label: string, fn: () => Promise<void>): Promise<void> {
  set({ busy: label });
  try {
    await fn();
  } catch (e) {
    console.error(e);
    notify('error', e instanceof Error ? e.message : String(e));
  } finally {
    set({ busy: null });
  }
}
