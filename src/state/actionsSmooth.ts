import { brushSelect } from '../core/paint';
import { applySplit, type SplitDiff, smoothBoundaryAt, smoothStrokeSplit } from '../core/smooth';
import { BASE_SLOT, type LabeledMesh, type Vec3 } from '../core/types';
import { bumpGeometry, onGeometryChanged, onLabelsChanged } from './actionsHooks';
import { clearLastSmart, mirrored, neighborLabel, partById } from './actionsPaint';
import { get, notify, pushHistory, set } from './store';
import { invalidateTopology, patchTopology, refreshGeometry, topologyOf } from './topologyCache';

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
    notify('warn', 'Yumuşatmak için sınırı düzeltilecek seti seç.');
    return false;
  }
  clearLastSmart();
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
export function applyMeshSplit(mesh: LabeledMesh, diff: SplitDiff, record = true): void {
  replaceMeshArrays(mesh, applySplit(mesh, diff), diff);
  if (record) pushHistory({ kind: 'split', mesh, diff }, 'Kenarı üçgenlere işle');
}

/** `forward` verilirse fark ileri uygulandı: önbellekler yerinde güncellenir; yoksa atılır. */
export function replaceMeshArrays(mesh: LabeledMesh, next: LabeledMesh, forward?: SplitDiff): void {
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
