import { largestPart } from '../core/geometry';
import { BASE_SLOT } from '../core/types';
import { assignFilaments, write3mfBambu } from '../io/bambu3mf';
import {
  downloadBytes,
  type ExportObject,
  write3mf,
  writeStl,
  writeStlZip,
} from '../io/exportFile';
import { type ImportedObject, importFile } from '../io/importFile';
import { PROJECT_EXTENSION, readProject, writeProject } from '../io/project';
import { geometry } from '../worker/client';
import { closeCoupon } from './actionsCoupon';
import { busy } from './actionsHooks';
import { clearPaintSession } from './actionsPaint';
import { startNewSession } from './actionsSession';
import { filamentReport } from './exportReport';
import {
  get,
  newPartId,
  nextSlotColor,
  notify,
  type Part,
  pushHistory,
  reservePartIds,
  set,
} from './store';

export async function importFiles(files: FileList | File[]): Promise<void> {
  // X115: model açılınca deneme görünümü kapanır
  closeCoupon();
  for (const file of Array.from(files)) {
    if (file.name.toLowerCase().endsWith(PROJECT_EXTENSION)) {
      await openProject(file);
      continue;
    }
    await busy(`${file.name} yükleniyor…`, async () =>
      addObjects(await importFile(file), file.name.replace(/\.[^.]+$/, '')),
    );
  }
}

/** X83: örnek figür tarayıcıda üretilir, dosya gibi açılır. */
export async function openSample(): Promise<void> {
  closeCoupon();
  await busy('Örnek model hazırlanıyor…', async () => {
    const m = await geometry.sample();
    await addObjects([{ name: 'örnek figür', positions: m.positions, indices: m.indices }]);
  });
}

/** X96: bu kadar üçgenin üstünde sadeleştirme önerilir; hedef `SIMPLIFY_TARGET`. */
export const SIMPLIFY_ABOVE = 1_000_000;
export const SIMPLIFY_TARGET = 400_000;

/**
 * X96: parçaları toplam `target` üçgene sadeleştirir (her parça kendi payı kadar).
 * Tek geçmiş adımı; boya korunur.
 */
export async function simplifyParts(ids: string[], target = SIMPLIFY_TARGET): Promise<void> {
  set({ simplifyOffer: null });
  const parts = get().parts.filter((p) => ids.includes(p.id));
  const total = parts.reduce((n, p) => n + p.mesh.labels.length, 0);
  if (!total) return;
  await busy('Sadeleştiriliyor…', async () => {
    const before = get().parts;
    const next = new Map<string, Part>();
    let tol = 0;
    for (const p of parts) {
      const share = Math.max(1000, Math.round((target * p.mesh.labels.length) / total));
      if (p.mesh.labels.length <= share) continue;
      const r = await geometry.simplify(p.mesh, share);
      tol = Math.max(tol, r.tolerance);
      next.set(p.id, { ...p, mesh: r.mesh });
    }
    if (!next.size) return;
    const after = before.map((p) => next.get(p.id) ?? p);
    set({ parts: after, preview: null, previewActive: false, pins: [], selectedPin: -1 });
    pushHistory({ kind: 'parts', before, after }, 'Sadeleştir');
    const now = after
      .filter((p) => ids.includes(p.id))
      .reduce((n, p) => n + p.mesh.labels.length, 0);
    notify(
      'info',
      `Sadeleştirildi: ${total.toLocaleString('tr-TR')} → ${now.toLocaleString('tr-TR')} üçgen; yüzey en çok ${tol.toFixed(2)} mm oynadı. Ctrl+Z geri alır.`,
    );
  });
}

/** İçe aktarılan nesneleri onarıp parça olarak ekler. */
async function addObjects(objects: ImportedObject[], source?: string): Promise<void> {
  const added: Part[] = [];
  // X109: nesne filamenti gövde rengi olur
  const bodyFilaments = new Set<number>();
  let bodyColorsMissing = false;
  const sceneBefore = get().parts;
  let painted = false;
  // X102: boş sahneye açılan dosya geçmişin tabanıdır, geri alınamaz
  const base = !sceneBefore.length;
  // X72: yeni model: mod yine öneriyi izler
  if (base) set({ cutModeManual: false });
  // X106: boş sahneye açılan model yeni oturumdur; kayıttaki eski oturum saklanır
  // kart açıkken (kayıt önerilirken) açılan model: kaydın saklandığı söylenir
  if (base) startNewSession(!!get().session.offer);
  for (const obj of objects) {
    const prepared = await geometry.prepare(obj.positions, obj.indices, obj.labels);
    if (obj.labels && ensurePaintSlots(prepared.mesh.labels, obj.filamentColors ?? []))
      painted = true;
    if (obj.filament) {
      ensureFilamentSlots([obj.filament], obj.filamentColors ?? []);
      bodyFilaments.add(obj.filament);
      if (!obj.filamentColors?.[obj.filament - 1]) bodyColorsMissing = true;
    }
    const r = prepared.report;
    const fixes = [
      r.removedDegenerate && `${r.removedDegenerate} dejenere üçgen silindi`,
      r.removedDuplicate && `${r.removedDuplicate} tekrarlı üçgen silindi`,
      r.flippedTriangles && `${r.flippedTriangles} üçgenin yönü düzeltildi`,
      r.filledHoles && `${r.filledHoles} delik kapatıldı`,
    ].filter(Boolean);
    if (fixes.length) notify('info', `${obj.name}: ${fixes.join(', ')}.`);
    if (prepared.local) {
      notify(
        'info',
        `${obj.name}: ${r.nonManifoldEdges} hatalı kenar çevresinde ${prepared.local.removed.toLocaleString('tr-TR')} üçgen silinip delikler kapatıldı; modelin geri kalanı aynı.`,
      );
    }
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
      name: stripModelExtension(obj.name),
      mesh: prepared.mesh,
      visible: true,
      badge: null,
      colorSlot: obj.filament ?? BASE_SLOT,
      manifold: prepared.manifold,
    };
    set((s) => ({ parts: [...s.parts, part], selectedPartId: part.id }));
    added.push(part);
  }
  if (base) set({ undoStack: [], redoStack: [] });
  else if (added.length) {
    // dolu sahneye ekleme tek adım: geri alınca yalnız bu dosyanın parçaları gider
    const more = added.length > 1 ? ` ve ${added.length - 1} parça` : '';
    pushHistory(
      { kind: 'parts', before: sceneBefore, after: get().parts },
      `Aç: ${added[0].name}${more}`,
    );
  }
  if (bodyFilaments.size) {
    const ids = [...bodyFilaments].sort((a, b) => a - b);
    const bodies = added.filter((p) => p.colorSlot).length;
    // tek gövdede ileti bir şey söylemez (rengi ekranda)
    if (bodies > 1)
      notify(
        'info',
        `${source ?? added[0].name}: ${bodies} gövde ${ids.length} filamentte (Filament ${ids.join(', ')}).`,
      );
    if (bodyColorsMissing)
      notify(
        'warn',
        "Dosyada filament renkleri yok; gövdeler Filament N setlerine ayrıldı, renkleri slicer'daki gibi değil.",
      );
  }
  // X104: boyalı 3MF'te hiçbir renk kesime hazır gelmez; kullanıcı ayıracağı rengi seçer
  if (painted) set({ activeSlot: BASE_SLOT, tool: 'smart' });
  // X80: çok parçalı dosyada son yüklenen değil, en büyük (hacim) parça seçili
  const big = added[largestPart(added.map((p) => p.mesh))];
  if (big) set({ selectedPartId: big.id });
  // X96: çok büyük modelde sadeleştirme önerilir
  const triangles = added.reduce((n, p) => n + p.mesh.labels.length, 0);
  if (triangles > SIMPLIFY_ABOVE)
    set({ simplifyOffer: { partIds: added.map((p) => p.id), triangles } });
}

/** X80: parça adında model dosyası uzantısı gösterilmez. */
function stripModelExtension(name: string): string {
  // 3MF nesne adları "nails_v1.0.stl_5" gibi olabiliyor: uzantı sonda olmayabilir
  return name.replace(/\.(stl|obj|3mf)(?=$|[_\s-])/i, '') || name;
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
    // X106: proje sahneyi değiştirir; eski çalışma "Önceki oturum" olarak saklanır
    startNewSession(get().parts.length > 0 || !!get().session.offer);
    reservePartIds(data.parts.map((p) => p.id));
    clearPaintSession();
    set({
      parts: data.parts,
      slots: data.slots,
      activeSlot: data.activeSlot,
      selectedPartId: data.selectedPartId,
      preview: null,
      previewActive: false,
      pins: [],
      selectedPin: -1,
      cutModeManual: false,
      undoStack: [],
      redoStack: [],
    });
    notify('info', `${file.name}: ${data.parts.length} parça açıldı.`);
  });
}

/**
 * Boyalı 3MF'teki filament numaraları için seçim seti açar; renkleri 3MF'ten alır.
 * X104: setler tek biçimde "Filament N" adını alır (kullanıcının verdiği ad korunur).
 * Boya varsa true.
 */
function ensurePaintSlots(labels: Uint16Array, colors: string[]): boolean {
  let max = 0;
  for (let t = 0; t < labels.length; t++) if (labels[t] > max) max = labels[t];
  if (!max) return false;
  ensureFilamentSlots(
    Array.from({ length: max }, (_, i) => i + 1),
    colors,
  );
  notify(
    'info',
    `Boyalı 3MF: ${max} filament rengi seçim seti olarak geldi. Ayıracağın renge tıkla.`,
  );
  return true;
}

/**
 * Filament numarası N için "Filament N" seti (kimlik N) açar ya da günceller; renk
 * 3MF'ten. X109: set filament numarasını taşır, Bambu 3MF'te aynı numarayla yazılır.
 */
function ensureFilamentSlots(ids: number[], colors: string[]): void {
  const slots = [...get().slots];
  for (const id of ids) {
    const color = colors[id - 1];
    const existing = slots.findIndex((s) => s.id === id);
    const name = `Filament ${id}`;
    if (existing < 0) slots.push({ id, name, color: color ?? nextSlotColor(id), filament: id });
    else {
      const s = slots[existing];
      slots[existing] = {
        ...s,
        name: s.name === `Seçim ${id}` ? name : s.name,
        color: color ?? s.color,
        filament: id,
      };
    }
  }
  slots.sort((a, b) => a.id - b.id);
  set({ slots });
}

function exportObjects(): ExportObject[] {
  const { parts, slots } = get();
  return parts
    .filter((p) => p.visible && p.badge !== 'source')
    .map((p) => {
      const slot = slots.find((s) => s.id === p.colorSlot);
      return {
        name: p.name,
        mesh: p.mesh,
        color: slot?.color ?? '#b0b0b0',
        filament: slot?.filament,
      };
    });
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
  // X110: renkler dosyaya yazılamıyor (bkz. bambu3mf.ts): eşleme kapanmayan iletide ve menüde
  const filaments = filamentReport(objs, assignFilaments(objs).filamentOf, get().slots);
  set({ lastExport: filaments });
  notify('info', `3MF hazır: ${objs.length} gövde, ${filaments.length} filament.`, {
    sticky: true,
    filaments,
  });
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
