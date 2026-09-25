import type { CutOptions } from '../core/cut';
import {
  brushSelect,
  bucketFill,
  cleanSelection,
  closeHoles,
  gapFill,
  refineToValley,
  type SmartFillOptions,
  smartFill,
} from '../core/paint';
import { BASE_SLOT, type LabeledMesh, type Vec3 } from '../core/types';
import { downloadBytes, type ExportObject, write3mf, writeStl, writeStlZip } from '../io/exportFile';
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
} from './store';
import { smoothRegionBoundary } from '../core/smooth';
import { concavityOf, type Topology, topologyOf } from './topologyCache';

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
        const prepared = await geometry.prepare(obj.positions, obj.indices);
        const r = prepared.report;
        const fixes = [
          r.removedDegenerate && `${r.removedDegenerate} dejenere üçgen silindi`,
          r.removedDuplicate && `${r.removedDuplicate} tekrarlı üçgen silindi`,
          r.flippedTriangles && `${r.flippedTriangles} üçgenin yönü düzeltildi`,
          r.filledHoles && `${r.filledHoles} delik kapatıldı`,
        ].filter(Boolean);
        if (fixes.length) notify('info', `${obj.name}: ${fixes.join(', ')}.`);
        if (!prepared.manifold) {
          notify('warn', `${obj.name}: onarım sonrası mesh kapalı değil, kesim çalışmayabilir. ${prepared.error ?? ''}`);
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
        pushHistory({ kind: 'parts', before, after: get().parts });
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
  return { center: [c[0] / area, c[1] / area, c[2] / area], normal: [n[0] / len, n[1] / len, n[2] / len] };
}

export function setSocketDirection(direction: Vec3 | null): void {
  set((s) => ({ cut: { ...s.cut, direction }, preview: null }));
}

/** A4: parçalar, etiketler ve slotlar tek dosyada. */
export function saveProject(): void {
  const { parts, slots, activeSlot, selectedPartId } = get();
  if (!parts.length) return notify('warn', 'Kaydedilecek parça yok.');
  const name = parts.find((p) => p.badge !== 'source')?.name ?? 'proje';
  downloadBytes(writeProject({ parts, slots, activeSlot, selectedPartId }), `${name}${PROJECT_EXTENSION}`);
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
      pinPoints: [],
      undoStack: [],
      redoStack: [],
    });
    notify('info', `${file.name}: ${data.parts.length} parça açıldı.`);
  });
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

export function export3mf(): void {
  const objs = exportObjects();
  if (!objs.length) return notify('warn', 'Dışa aktarılacak görünür parça yok.');
  downloadBytes(write3mf(objs), 'parts.3mf', 'model/3mf');
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
}

let stroke: Stroke | null = null;
/** Son Smart Fill; eşik değişince canlı yeniden hesaplanır. */
let lastSmart: { partId: string; seed: number; entry: Extract<HistoryEntry, { kind: 'paint' }> } | null = null;

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
  set((s) => ({ paintVersion: s.paintVersion + 1 }));
  onLabelsChanged?.(part.id, tris);
}

/** Viewport'un değişen üçgenleri yeniden boyaması için kanca. */
export let onLabelsChanged: ((partId: string, tris?: ArrayLike<number>) => void) | null = null;
export function setLabelsChangedHook(fn: typeof onLabelsChanged): void {
  onLabelsChanged = fn;
}

export function beginStroke(partId: string): void {
  stroke = { partId, before: new Map() };
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
  const entry = { kind: 'paint' as const, mesh: part.mesh, tris, before, after };
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
  const tris = brushSelect(topo.adj, topo.centroids, tri, point, get().brushRadius);
  applyLabels(part, tris, paintLabel(erase));
}

export function bucketAt(partId: string, tri: number, erase: boolean): void {
  const part = partById(partId);
  if (!part) return;
  beginStroke(partId);
  applyLabels(part, bucketFill(topologyOf(part.mesh).adj, part.mesh.labels, tri), paintLabel(erase));
  endStroke();
}

function smartOptions(topo: Topology): SmartFillOptions {
  const { smartAngle, smartScale, smartConcave } = get();
  return { maxAngleDeg: smartAngle, scale: smartScale > 0 ? smartScale : topo.meanEdge * 3, concaveOnly: smartConcave };
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
  let tris: ArrayLike<number> = smartFill(topo.adj, topo.normals, topo.centroids, seed, opts);
  if (get().smartValley) {
    const mask = new Uint8Array(labels.length);
    for (let i = 0; i < tris.length; i++) mask[tris[i]] = 1;
    const refined = refineToValley(topo.adj, topo.centroids, concavityOf(mesh, opts.scale), mask, opts.scale * 2);
    for (let t = 0; t < refined.length; t++) if (refined[t] && !same(t)) refined[t] = 0;
    // vadi seçimi tohumu dışarıda bırakırsa (ör. düz alana tıklama) ham sonuç kalır
    if (refined[seed]) {
      const clean = cleanSelection(topo.adj, topo.areas, refined, { keepSeed: seed, accept: same });
      const out: number[] = [];
      for (let t = 0; t < clean.length; t++) if (clean[t]) out.push(t);
      tris = out;
    }
  }
  return Uint32Array.from(closeHoles(topo.adj, topo.areas, tris, { maxHoleFraction: 0.05, accept: same }).tris);
}

/** Otomatik ölçekte seçili parçanın kullanacağı değer (arayüzde göstermek için). */
export function autoSmartScale(): number {
  const part = selectedPart();
  return part ? topologyOf(part.mesh).meanEdge * 3 : 0;
}

export function smartFillAt(partId: string, tri: number, erase: boolean): void {
  const part = partById(partId);
  if (!part) return;
  const topo = topologyOf(part.mesh);
  beginStroke(partId);
  const tris = smartSelect(topo, part.mesh, tri);
  applyLabels(part, tris, paintLabel(erase));
  const entry = endStroke();
  lastSmart = entry ? { partId, seed: tri, entry } : null;
  warnIfLeaked(tris.length, part.mesh.labels.length);
}

function warnIfLeaked(selected: number, total: number): void {
  if (selected > total * 0.5) {
    notify('warn', 'Seçim modelin yarısından fazlasına yayıldı. Açıyı düşürün (Shift+sağ sürükle) veya Ctrl+Z.');
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
  const tris = smartSelect(topo, part.mesh, lastSmart.seed);
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
  const { tris, newLabels } = gapFill(part.mesh, topo.adj, part.mesh.labels, topo.areas, get().gapArea);
  if (!tris.length) return notify('info', 'Kapatılacak boşluk bulunamadı.');
  const byLabel = new Map<number, number[]>();
  tris.forEach((t, i) => {
    const list = byLabel.get(newLabels[i]);
    if (list) list.push(t);
    else byLabel.set(newLabels[i], [t]);
  });
  beginStroke(part.id);
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
  const { smoothRadius } = get();
  const radius = smoothRadius > 0 ? smoothRadius : smartOptions(topo).scale;
  const r = smoothRegionBoundary(
    part.mesh,
    topo.adj,
    slot,
    radius,
    (t) => labels[t] === BASE_SLOT,
    (t) => neighborLabel(topo.adj, labels, t, slot),
  );
  const mesh = { positions: r.positions, indices: part.mesh.indices, labels: r.labels };
  const before = get().parts;
  const after = before.map((p) => (p.id === part.id ? { ...p, mesh } : p));
  lastSmart = null;
  set({ parts: after, preview: null });
  pushHistory({ kind: 'parts', before, after });
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

// ---------- slotlar ----------

export function addSlot(): void {
  const slots = get().slots;
  const id = Math.max(...slots.map((s) => s.id)) + 1;
  set({ slots: [...slots, { id, name: `Slot ${id}`, color: nextSlotColor(id) }], activeSlot: id });
}

export function updateSlot(id: number, patch: { name?: string; color?: string }): void {
  set((s) => ({ slots: s.slots.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  for (const p of get().parts) onLabelsChanged?.(p.id);
}

// ---------- kesim ----------

function cutOptions(): CutOptions {
  const { cut, activeSlot, pinPoints } = get();
  return {
    mode: cut.mode,
    slot: activeSlot,
    depth: cut.mode === 'socket' ? cut.depth : 0,
    clearance: cut.clearance,
    squeeze: cut.mode === 'socket' ? cut.squeeze : 0,
    direction: cut.mode === 'socket' && cut.direction ? cut.direction : undefined,
    pin: { shape: cut.pinShape, radius: cut.pinRadius, length: cut.pinLength, onPart: cut.pinOnPart },
    pinPoints: cut.mode === 'keys' ? pinPoints : undefined,
  };
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

export async function togglePreview(): Promise<void> {
  if (get().preview) return set({ preview: null });
  const part = cutTarget();
  if (!part) return;
  await busy('Önizleme hazırlanıyor…', async () => {
    const p = await geometry.preview(part.mesh, cutOptions());
    for (const w of p.warnings) notify('warn', w);
    set({ preview: p });
  });
}

export async function runCut(): Promise<void> {
  const part = cutTarget();
  if (!part) return;
  const opts = cutOptions();
  await busy('Kesiliyor…', async () => {
    const r = await geometry.cut(part.mesh, opts);
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
      return p.id === part.id ? [{ ...p, badge: 'source' as const, visible: false }, ...newParts] : [cleared];
    });
    // yön ve pimler bölgeye özgü: sonraki kesim otomatikten başlar
    set((s) => ({
      parts: after,
      selectedPartId: newParts[0].id,
      preview: null,
      pinPoints: [],
      directionGizmo: false,
      cut: { ...s.cut, direction: null },
    }));
    pushHistory({ kind: 'parts', before, after });
    notify('info', `Kesildi: ${newParts.length} yeni parça. Kaynak parça gizlendi (sarı rozet).`);
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
    set({ parts: after, preview: null });
    pushHistory({ kind: 'parts', before, after });
    notify('info', `${part.name}: ${part.mesh.labels.length} → ${mesh.labels.length} üçgen.`);
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
    pushHistory({ kind: 'parts', before, after });
    notify('info', `${pieces.length} parçaya bölündü.`);
  });
}

// ---------- parça yönetimi ----------

export function selectPart(id: string): void {
  set({ selectedPartId: id, preview: null });
}

export function toggleVisible(id: string): void {
  set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)) }));
}

export function deletePart(id: string): void {
  const before = get().parts;
  const after = before.filter((p) => p.id !== id);
  set((s) => ({ parts: after, selectedPartId: s.selectedPartId === id ? (after[0]?.id ?? null) : s.selectedPartId }));
  pushHistory({ kind: 'parts', before, after });
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
  } else {
    const parts = reverse ? entry.before : entry.after;
    set((s) => ({
      parts,
      selectedPartId: parts.some((p) => p.id === s.selectedPartId) ? s.selectedPartId : (parts[0]?.id ?? null),
      preview: null,
    }));
  }
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
