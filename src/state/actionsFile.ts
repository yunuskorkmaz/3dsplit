import { BASE_SLOT } from '../core/types';
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
import { busy } from './actionsHooks';
import { clearPaintSession } from './actionsPaint';
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
