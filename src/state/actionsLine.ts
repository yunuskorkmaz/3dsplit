import { CutError, seamSeparates } from '../core/cut';
import { regionInsideLoop, surfacePath, vertexNeighbors } from '../core/lasso';
import { smoothStrokeSplit } from '../core/smooth';
import { BASE_SLOT, type LabeledMesh, type Vec3 } from '../core/types';
import { onLabelsChanged } from './actionsHooks';
import { adoptRegionColor, mirrored, neighborLabel, partById } from './actionsPaint';
import { applyMeshSplit } from './actionsSmooth';
import { get, notify, type Part, pushHistory, set } from './store';
import { topologyOf } from './topologyCache';

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
  adoptRegionColor(part, unique, before, new Uint16Array(unique.length).fill(slot));
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
