import type { CutMode, CutOptions } from '../core/cut';
import { boundingBox } from '../core/geometry';
import { BASE_SLOT, type LabeledMesh, type Vec3 } from '../core/types';
import { GeometryAbort, geometry } from '../worker/client';
import { busy, geomKey } from './actionsHooks';
import { lineCancel } from './actionsLine';
import { innerMessages } from './innerMessages';
import {
  get,
  newPartId,
  notify,
  type Part,
  pushHistory,
  regionState,
  selectedPart,
  set,
  useStore,
} from './store';
import { topologyOf } from './topologyCache';

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

// ---------- kesim ----------

export function cutOptions(): CutOptions {
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
    edgeSmoothing: cut.edgeSmoothing ?? 'medium',
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

/** X91: seçili parçada aktif rengin boyalı üçgen sayısı (taban ya da parça yoksa 0). */
export function activePaintCount(): number {
  const { activeSlot } = get();
  const part = selectedPart();
  if (!part || activeSlot === BASE_SLOT) return 0;
  let n = 0;
  for (const l of part.mesh.labels) if (l === activeSlot) n++;
  return n;
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
/** X78: son istenen öneri sonuçlanınca (ya da gerek kalmayınca) çözülür. */
let suggestionSettled: Promise<void> = Promise.resolve();
let settleSuggestion: (() => void) | null = null;
/** X103: son sonuçlanan önerinin hangi parça, set ve boya için olduğu. */
let suggestedFor: string | null = null;
/** X103: son öneri İptal ile kesildi mi (o zaman bekleyen kesim de yapılmaz). */
let suggestionAborted = false;

/**
 * X114: önizleme hatasının geçerli olduğu girdiler: parça, set, boya, mod ve ayarlar,
 * pimler. Biri değişince Kes yeniden açılır.
 */
export function previewKey(s = get()): string {
  return `${s.selectedPartId}:${s.activeSlot}:${s.paintVersion}:${JSON.stringify(s.cut)}:${JSON.stringify(s.pins)}`;
}

function suggestionKey(): string {
  const s = get();
  return `${s.selectedPartId}:${s.activeSlot}:${s.paintVersion}`;
}

export function scheduleSuggestion(delay = 400): void {
  if (suggestTimer) clearTimeout(suggestTimer);
  if (!settleSuggestion)
    suggestionSettled = new Promise((resolve) => {
      settleSuggestion = resolve;
    });
  // X103: eski öneri başka bölgeye ait; hemen kalkar, yenisi gelene kadar Kes bekler
  if (get().suggestion || !get().suggesting) set({ suggestion: null, suggesting: true });
  suggestTimer = setTimeout(async () => {
    const part = selectedPart();
    const slot = get().activeSlot;
    const key = suggestionKey();
    const seq = ++suggestSeq;
    const settle = () => {
      if (seq !== suggestSeq) return;
      suggestedFor = key;
      set({ suggesting: false });
      settleSuggestion?.();
      settleSuggestion = null;
    };
    if (!part || slot === BASE_SLOT || !part.mesh.labels.includes(slot)) {
      set({ suggestion: null });
      settle();
      return;
    }
    try {
      const s = await geometry.suggest(part.mesh, slot);
      if (seq !== suggestSeq) return;
      suggestionAborted = false;
      set({ suggestion: s });
      // X72: elle seçilmediyse mod öneriye geçer (Yapıştır yalnız elle seçilir)
      const { cut, cutModeManual } = get();
      if (s && !cutModeManual && cut.mode !== s.mode && cut.mode !== 'fast')
        set({ cut: { ...cut, mode: s.mode } });
    } catch (e) {
      if (seq === suggestSeq) {
        suggestionAborted = e instanceof GeometryAbort;
        set({ suggestion: null });
      }
    } finally {
      settle();
    }
  }, delay);
}

/**
 * Boyama, set veya parça değişince öneriyi yeniler. X103: store aboneliği, değişiklikle
 * aynı anda çalışır; React effect'i bir kare geç kalıp eski öneriyi ve açık Kes'i gösteriyordu.
 */
export function startSuggestionWatch(): () => void {
  scheduleSuggestion();
  return useStore.subscribe((s, prev) => {
    if (
      s.paintVersion !== prev.paintVersion ||
      s.activeSlot !== prev.activeSlot ||
      s.selectedPartId !== prev.selectedPartId ||
      s.parts !== prev.parts
    )
      scheduleSuggestion();
  });
}

/**
 * X103: mod öneriyi izliyorsa kesimden önce o bölgenin önerisi gelmiş olmalı;
 * yoksa eski bölgenin moduyla kesilir ("Bu seti kes" seti değiştirip hemen keser).
 */
async function awaitFreshSuggestion(): Promise<boolean> {
  if (get().cutModeManual) return true;
  if (!get().suggesting && suggestedFor === suggestionKey()) return true;
  if (!get().suggesting) scheduleSuggestion(0);
  await busy('Kesim modu belirleniyor…', () => suggestionSettled);
  return !suggestionAborted;
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
  autoOpened = false;
  set({ previewActive: true });
  await refreshPreview(true);
}

let previewSeq = 0;

/** X78: önizlemeyi boya açtı (Space değil). Yavaş parçada sonraki değişiklikte kapanır. */
let autoOpened = false;

/** X78: bundan uzun süren önizleme canlı önizlemeyi o parçada kapatır, ms. */
const SLOW_PREVIEW_MS = 1500;

/** X78: bu meshte bu modun önizlemesi uzun sürdü mü. */
export function isSlowPreview(
  list: { mesh: LabeledMesh; mode: CutMode }[],
  mesh: LabeledMesh,
  mode: CutMode,
): boolean {
  return list.some((x) => x.mesh === mesh && x.mode === mode);
}

/** Meshi o mod için yavaş listesine ekler ya da çıkarır (son 8 kayıt tutulur). */
function markSlow(mesh: LabeledMesh, mode: CutMode, slow: boolean): void {
  const list = get().slowPreview;
  if (slow === isSlowPreview(list, mesh, mode)) return;
  set({
    slowPreview: slow
      ? [...list, { mesh, mode }].slice(-8)
      : list.filter((x) => x.mesh !== mesh || x.mode !== mode),
  });
}

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
  // X78: boyarken kendiliğinden açılan önizleme
  const live = !loud && autoOpened && !seam;
  const run = async () => {
    try {
      // mod öneriyi izliyorsa önce öneri gelsin: yanlış modda boşuna hesap yapılmaz
      if (live && !get().cutModeManual) {
        await suggestionSettled;
        if (seq !== previewSeq) return;
      }
      const opts = seam ? seamOptions(seam.loop) : cutOptions();
      const started = performance.now();
      const p = await geometry.preview(target.mesh, opts, geomKey(target.mesh));
      if (!seam) markSlow(target.mesh, opts.mode, performance.now() - started > SLOW_PREVIEW_MS);
      // bu arada yeni istek geldiyse ya da mod kapandıysa eski sonucu gösterme
      if (seq !== previewSeq || !get().previewActive) return;
      if (loud)
        for (const w of [...p.warnings, ...innerMessages(p.inner, get().slots, opts.mode, false)])
          notify('warn', w);
      set({ preview: p, previewError: null });
    } catch (e) {
      if (seq !== previewSeq) return;
      const text = e instanceof Error ? e.message : String(e);
      // X114: kesim olmayacak: Kes kapanır, neden seçim satırında; ileti bir kez
      if (!seam && !(e instanceof GeometryAbort)) {
        if (get().previewError?.text !== text) notify('error', `Önizleme: ${text}`);
        set({ preview: null, previewError: { key: previewKey(), text } });
        return;
      }
      notify('error', `Önizleme: ${text}`);
      set({ preview: null });
    }
  };
  if (loud) await busy('Önizleme hazırlanıyor…', run);
  else await run();
}

/**
 * X74/X78: boya, slot, parça ya da mod değişince önizleme kendiliğinden açılır
 * (üç modda da; Space'e basmadan pin ve tapa görünür). Space ile kapatılırsa bir
 * sonraki boyaya kadar kapalı kalır. Önizlemesi uzun süren parçada açılmaz.
 * Gecikme ve eski sonucu atma aşağıdaki yenilemede.
 */
useStore.subscribe((s, prev) => {
  if (s.previewActive || s.tool === 'seam') return;
  if (
    s.paintVersion === prev.paintVersion &&
    s.activeSlot === prev.activeSlot &&
    s.selectedPartId === prev.selectedPartId &&
    s.cut.mode === prev.cut.mode
  )
    return;
  const part = s.parts.find((p) => p.id === s.selectedPartId);
  if (!part || s.activeSlot === BASE_SLOT || !part.mesh.labels.includes(s.activeSlot)) return;
  if (isSlowPreview(s.slowPreview, part.mesh, s.cut.mode)) return;
  autoOpened = true;
  set({ previewActive: true });
  schedulePreview();
});

function schedulePreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  // yeni istek beklerken eski sonuç gelirse gösterilmesin
  previewSeq++;
  previewTimer = setTimeout(() => {
    previewTimer = null;
    refreshPreview();
  }, 300);
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
  // X78: kendiliğinden açılan önizleme yavaş parçada yenilenmez, kapanır (Space ile açılır)
  const part = s.parts.find((p) => p.id === s.selectedPartId);
  if (autoOpened && part && isSlowPreview(s.slowPreview, part.mesh, s.cut.mode)) {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    previewSeq++;
    set({ previewActive: false, preview: null });
    return;
  }
  schedulePreview();
});

/** X98: sıradaki "Gövde N" ve "Kes K" numaraları (gizli önceki haller dahil). */
function nextNumbers(parts: Part[]): { body: number; cut: number } {
  let body = 0;
  let cut = 0;
  for (const p of parts) {
    const b = /^Gövde (\d+)$/.exec(p.name);
    if (b) body = Math.max(body, Number(b[1]));
    const c = p.origin && /^Kes (\d+)$/.exec(p.origin.feature);
    if (c) cut = Math.max(cut, Number(c[1]));
  }
  return { body: body + 1, cut: cut + 1 };
}

/** X98: kesilen seçim tüketilir: o setin boyası yeni gövdelerden silinir, renk gövdeye geçer. */
function consumeSelection(mesh: LabeledMesh, slot: number): LabeledMesh {
  const labels = mesh.labels.slice();
  for (let t = 0; t < labels.length; t++) if (labels[t] === slot) labels[t] = BASE_SLOT;
  return { ...mesh, labels };
}

export async function runCut(): Promise<void> {
  const seam = seamReady();
  if (get().tool === 'seam') {
    if (!seam) return notify('warn', 'Önce dikiş halkasını kapatın.');
    return runSeamCut(seam.part, seam.loop);
  }
  if (!cutTarget()) return;
  if (!(await awaitFreshSuggestion())) return;
  const part = cutTarget();
  if (!part) return;
  const opts = cutOptions();
  const slotLabel = get().slots.find((s) => s.id === opts.slot)?.name ?? '';
  const modeLabel =
    opts.mode === 'socket' ? 'Tapa' : opts.mode === 'keys' ? 'Pimli kes' : 'Yapıştır';
  await busy(`Kesiliyor · ${modeLabel} · ${slotLabel} · ${part.name}`, async () => {
    const r = await geometry.cut(part.mesh, opts, geomKey(part.mesh), (stage) =>
      set({ busyStage: stage }),
    );
    if (!r.ok) {
      set({ errorLoops: r.loops.length ? r.loops : null });
      notify('error', r.loops.length ? `${r.error} Sorunlu sınır kırmızıyla gösterildi.` : r.error);
      return;
    }
    set({ errorLoops: null });
    for (const w of innerMessages(r.inner, get().slots, opts.mode, true)) notify('warn', w);
    for (const w of r.warnings) notify('warn', w);
    const slotName = get().slots.find((s) => s.id === opts.slot)?.name ?? `Slot ${opts.slot}`;
    const modeName =
      opts.mode === 'socket' ? 'Tapa' : opts.mode === 'keys' ? 'Pimli kes' : 'Yapıştır';
    const n = nextNumbers(get().parts);
    const origin = { feature: `Kes ${n.cut}`, detail: `${modeName} · ${slotName}` };
    const newParts: Part[] = [
      {
        id: newPartId(),
        name: part.name,
        mesh: consumeSelection(r.body, opts.slot),
        visible: true,
        badge: 'new',
        colorSlot: part.colorSlot,
        manifold: true,
        origin,
      },
      ...r.parts.map((mesh: LabeledMesh, i: number) => ({
        id: newPartId(),
        name: `Gövde ${n.body + i}`,
        mesh: consumeSelection(mesh, opts.slot),
        visible: true,
        badge: 'new' as const,
        colorSlot: opts.slot,
        manifold: true,
        origin,
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
    const regionBefore = regionState();
    set((s) => ({
      parts: after,
      selectedPartId: newParts[0].id,
      suggestion: null,
      preview: null,
      pins: [],
      selectedPin: -1,
      directionGizmo: false,
      cut: { ...s.cut, direction: null, islandDepths: {}, ringProfile: [0, 0, 0, 0, 0, 0, 0, 0] },
    }));
    const made = newParts.slice(1).map((p) => p.name);
    pushHistory(
      { kind: 'parts', before, after, region: { before: regionBefore, after: regionState() } },
      `${origin.feature} · ${origin.detail} → ${made.join(', ')}`,
    );
    set({ previewActive: false, preview: null });
    notify(
      'info',
      `${origin.feature}: ${made.join(', ')} ayrıldı (${origin.detail}). Kesilmeden önceki hal Önceki haller'de gizli.`,
    );
  });
}

async function runSeamCut(part: Part, loop: number[]): Promise<void> {
  const opts = seamOptions(loop);
  await busy(`Kesiliyor · Dikiş · ${part.name}`, async () => {
    const r = await geometry.cut(part.mesh, opts, geomKey(part.mesh), (stage) =>
      set({ busyStage: stage }),
    );
    if (!r.ok) {
      set({ errorLoops: r.loops.length ? r.loops : null, line: { ...get().line, bad: true } });
      notify('error', r.loops.length ? `${r.error} Halka kırmızıyla gösterildi.` : r.error);
      return;
    }
    set({ errorLoops: null });
    for (const w of r.warnings) notify('warn', w);
    const n = nextNumbers(get().parts);
    const origin = { feature: `Kes ${n.cut}`, detail: 'Dikiş' };
    const newParts: Part[] = [
      {
        id: newPartId(),
        name: part.name,
        mesh: r.body,
        visible: true,
        badge: 'new',
        colorSlot: part.colorSlot,
        manifold: true,
        origin,
      },
      ...r.parts.map((mesh: LabeledMesh, i: number) => ({
        id: newPartId(),
        name: `Gövde ${n.body + i}`,
        mesh,
        visible: true,
        badge: 'new' as const,
        colorSlot: part.colorSlot,
        manifold: true,
        origin,
      })),
    ];
    const before = get().parts;
    const after = before.flatMap((p) => {
      const cleared = p.badge === 'new' ? { ...p, badge: null } : p;
      return p.id === part.id
        ? [{ ...p, badge: 'source' as const, visible: false }, ...newParts]
        : [cleared];
    });
    const regionBefore = regionState();
    set((s) => ({
      parts: after,
      selectedPartId: newParts[0].id,
      suggestion: null,
      preview: null,
      pins: [],
      selectedPin: -1,
      directionGizmo: false,
      cut: { ...s.cut, direction: null, islandDepths: {}, ringProfile: [0, 0, 0, 0, 0, 0, 0, 0] },
    }));
    lineCancel();
    const made = newParts.slice(1).map((p) => p.name);
    pushHistory(
      { kind: 'parts', before, after, region: { before: regionBefore, after: regionState() } },
      `${origin.feature} · Dikiş → ${made.join(', ')}`,
    );
    set({ previewActive: false, preview: null });
    notify(
      'info',
      `${origin.feature}: ${made.join(', ')} ayrıldı (dikiş${opts.mode === 'keys' ? ', kesite pim kondu' : ', yapıştırmalık'}). Kesilmeden önceki hal Önceki haller'de gizli.`,
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
