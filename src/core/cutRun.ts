import type { Manifold } from 'manifold-3d';
import { capPlugVolumes, capSplit, extrudeVolume, ringMarkersFor, triangulateLoop } from './cutCap';
import { checkPinContainment, makePin, pinCenters, pinDepthClearance } from './cutPins';
import { loopPlane, planePatch, planeSplit, seamCut, seamPreview } from './cutSeam';
import {
  capProjections,
  depthOf,
  growVolume,
  isHeightField,
  manifoldMesh,
  partFrom,
  shouldSweepSocket,
  socketCut,
  socketDirection,
  socketVolume,
} from './cutSocket';
import {
  CutError,
  type CutOptions,
  type CutPreview,
  type CutResult,
  type Island,
  type ModelProvider,
  modelOf,
  withModel,
} from './cutTypes';
import { signedVolume } from './geometry';
import { CUT_FACE_ID, fromManifoldMapped, KernelError, Scope, toManifold } from './kernel';
import { meshTopology } from './meshTopology';
import { closeHoles } from './paint';
import { boundaryLoops, connectedComponents, extractTriangles } from './topology';
import { BASE_SLOT, type LabeledMesh, type MeshData, type Vec3 } from './types';
import { add, dot, normalize, scale, sub, vertexAt } from './vec';

export function findIslands(mesh: LabeledMesh, slot: number, warnings: string[] = []): Island[] {
  const triCount = mesh.labels.length;
  const mask = new Uint8Array(triCount);
  let selected = 0;
  for (let t = 0; t < triCount; t++) {
    if (mesh.labels[t] === slot) {
      mask[t] = 1;
      selected++;
    }
  }
  if (selected === 0) throw new CutError('Bu slotta boyalı üçgen yok.');
  if (selected === triCount)
    throw new CutError('Bölge parçanın tamamını kaplıyor; kesilecek sınır yok.');

  const { adj, normals, areas } = meshTopology(mesh);
  const { component, count } = connectedComponents(triCount, adj, mask);
  const groups: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triCount; t++) if (component[t] >= 0) groups[component[t]].push(t);

  // köşeden bağlı tek tük üçgenler (tırtıklı boyamadan) ayrı parça olmasın
  const groupArea = groups.map((g) => g.reduce((sum, t) => sum + areas[t], 0));
  const largest = Math.max(...groupArea);
  let dropped = 0;

  const absorbedAll = new Uint8Array(triCount);
  let absorbedHoles = 0;
  const islands: Island[] = [];
  for (const [gi, group] of groups.entries()) {
    if (absorbedAll[group[0]]) continue; // başka adanın deliğinin içinde kalmış
    if (groupArea[gi] < 1 && groupArea[gi] < largest * 0.01) {
      dropped++;
      continue;
    }
    const { tris, holes } = closeHoles(adj, areas, group);
    absorbedHoles += holes;
    const islandMask = new Uint8Array(triCount);
    let n: Vec3 = [0, 0, 0];
    for (const t of tris) {
      islandMask[t] = 1;
      absorbedAll[t] = 1;
      n = add(n, scale([normals[3 * t], normals[3 * t + 1], normals[3 * t + 2]], areas[t]));
    }
    const loops = boundaryLoops(mesh, adj, islandMask);
    // pimler en büyük halkanın düzlemine konur
    let main = { normal: normalize(n), center: [0, 0, 0] as Vec3, area: -1 };
    let mainLoop: number[] = loops[0] ?? [];
    for (const loop of loops) {
      const plane = loopPlane(mesh.positions, loop);
      if (plane.area > main.area) {
        main = plane;
        mainLoop = loop;
      }
    }
    const { normal: capNormal, center: capCenter } = main;
    islands.push({
      tris,
      loops,
      normal: normalize(n),
      capNormal,
      capCenter,
      mainLoop,
      adj,
      key: group[0],
    });
  }
  if (dropped) warnings.push(`${dropped} çok küçük boyalı kırıntı atlandı (1 mm² altı).`);
  if (absorbedHoles)
    warnings.push(`Bölgenin içinde kalan ${absorbedHoles} boyanmamış delik kesime dahil edildi.`);
  return islands;
}

export function previewCut(mesh: LabeledMesh, opts: CutOptions, model?: ModelProvider): CutPreview {
  return withModel(model, () => previewCutImpl(mesh, opts));
}

function previewCutImpl(mesh: LabeledMesh, opts: CutOptions): CutPreview {
  if (opts.seamLoop && opts.seamLoop.length >= 3) return seamPreview(mesh, opts.seamLoop, opts);
  const scope = new Scope();
  const warnings: string[] = [];
  try {
    const islands = findIslands(mesh, opts.slot, warnings);
    const volumes: MeshData[] = [];
    const pins: MeshData[] = [];
    const ringMarkers: Vec3[] = [];
    if (opts.mode === 'socket' && islands[0]) {
      const i0 = islands[0];
      const dir0 = shouldSweepSocket(mesh, islands, opts)
        ? socketDirection(i0, opts)
        : (capProjections(opts)[0]?.(i0) ?? i0.capNormal);
      ringMarkers.push(...ringMarkersFor(mesh, i0, dir0, depthOf(i0, opts), opts.ringProfile));
    }
    // duvar kontrolü için: [yuvayı içeren katı, yuva hacmi (büyütülmüş), içeri bakan yön, yüzeydeki referans nokta, ad]
    const cavities: {
      container: () => Manifold;
      grown: () => Manifold;
      inward: Vec3;
      ref: Vec3;
      slack: number;
      name: string;
    }[] = [];
    // kesim halkası düzlemden ne kadar sapıyor: yuvanın ağzı bu kadar derinliğe kadar yüzeye açılabilir
    const slackOf = (island: Island, normal: Vec3) => {
      let m = 0;
      for (const v of island.mainLoop)
        m = Math.max(m, Math.abs(dot(sub(vertexAt(mesh.positions, v), island.capCenter), normal)));
      return m;
    };
    const minWall = opts.minWall ?? 0;
    let model: Manifold | null = null;
    const modelM = () => (model ??= modelOf(mesh, scope));

    if (opts.mode === 'socket' && !shouldSweepSocket(mesh, islands, opts)) {
      // çıkıntı yöntemi: kesim kapakları ve gövdeye giren tapa prizmaları
      const eps = Math.max(1, 4 * opts.clearance);
      for (const island of islands) {
        for (const { mesh: vol, dir } of capPlugVolumes(
          mesh.positions,
          island,
          depthOf(island, opts),
          eps,
          capProjections(opts)[0],
          opts.squeeze,
          opts.inset,
          opts.ringProfile,
        )) {
          volumes.push(vol);
          cavities.push({
            container: modelM,
            grown: () =>
              growVolume(
                scope.keep(toManifold(vol, CUT_FACE_ID)),
                dir,
                opts.clearance + minWall,
                scope,
              ),
            inward: scale(dir, -1),
            ref: island.capCenter,
            slack: slackOf(island, dir),
            name: 'Tapa yuvası',
          });
        }
      }
    } else if (opts.mode === 'socket') {
      const eps = Math.max(0.5, 4 * opts.clearance);
      for (const island of islands) {
        const dir = socketDirection(island, opts);
        const vol = isHeightField(mesh, island, dir)
          ? extrudeVolume(
              mesh,
              island,
              dir,
              depthOf(island, opts),
              eps,
              opts.squeeze,
              opts.inset,
              opts.ringProfile,
            )
          : manifoldMesh(socketVolume(mesh, island, opts, eps, scope, warnings));
        volumes.push(vol);
        cavities.push({
          container: modelM,
          grown: () =>
            growVolume(
              scope.keep(toManifold(vol, CUT_FACE_ID)),
              dir,
              opts.clearance + minWall,
              scope,
            ),
          inward: scale(dir, -1),
          ref: island.capCenter,
          slack: slackOf(island, dir),
          name: 'Tapa yuvası',
        });
      }
    } else {
      for (const island of islands) {
        if (opts.planar) {
          volumes.push(planePatch(mesh.positions, island));
          continue;
        }
        const idx: number[] = [];
        for (const loop of island.loops) idx.push(...triangulateLoop(mesh.positions, loop));
        volumes.push(
          extractTriangles(
            { positions: mesh.positions, indices: Uint32Array.from(idx) },
            range(idx.length / 3),
          ).mesh,
        );
      }
      if (opts.mode === 'keys') {
        const placed = pinCenters(mesh.positions, islands, opts.pins, opts.pin);
        let split: { body: Manifold; parts: Manifold[] } | null = null;
        const splitM = () => {
          if (!split) {
            const sp = capSplit(mesh, islands);
            split = {
              body: scope.keep(toManifold(sp.body, sp.body.origin)),
              parts: sp.parts.map((p) => scope.keep(toManifold(p, p.origin))),
            };
          }
          return split;
        };
        for (const [k, { island, center, surface, axis, spec }] of placed.entries()) {
          pins.push(manifoldMesh(makePin(spec, center, axis, 0, scope)));
          // yuva, pimin karşı tarafındaki katıda açılır
          const inward = opts.pin.onPart ? axis : scale(axis, -1);
          cavities.push({
            container: () =>
              opts.pin.onPart ? splitM().body : splitM().parts[islands.indexOf(island)],
            grown: () =>
              makePin(
                spec,
                center,
                axis,
                opts.clearance + minWall,
                scope,
                pinDepthClearance(opts) + minWall,
              ),
            inward,
            ref: surface,
            slack: slackOf(island, island.capNormal),
            name: placed.length > 1 ? `Pim ${k + 1}` : 'Pim',
          });
        }
      }
    }

    const thin: MeshData[] = [];
    if (minWall > 0) {
      for (const c of cavities) {
        try {
          // yuvanın ağzı (yüzeye açılan kısmı) bilerek dışarıda: kesim yüzeyinin minWall
          // (+ kesim halkasının düzlemden sapması) altından kes
          const grown = c.grown().trimByPlane(c.inward, dot(c.inward, c.ref) + minWall + c.slack);
          scope.keep(grown);
          const out = scope.keep(grown.subtract(c.container()));
          if (out.volume() > 1e-3) {
            thin.push(manifoldMesh(out));
            warnings.push(
              `${c.name} çevresinde duvar ${minWall} mm'den ince (kırmızı). Derinliği/pimi küçültün veya yerini değiştirin.`,
            );
          }
        } catch (e) {
          if (!(e instanceof KernelError)) throw e;
        }
      }
    }
    return { volumes, pins, thin, ringMarkers, warnings };
  } finally {
    scope.dispose();
  }
}

function range(n: number): Uint32Array {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/** Seçili slotun bölgelerini parçadan ayırır. */
export function cutRegion(mesh: LabeledMesh, opts: CutOptions, model?: ModelProvider): CutResult {
  return withModel(model, () =>
    opts.seamLoop && opts.seamLoop.length >= 3
      ? seamCut(mesh, opts.seamLoop, opts)
      : cutRegionImpl(mesh, opts),
  );
}

function cutRegionImpl(mesh: LabeledMesh, opts: CutOptions): CutResult {
  const scope = new Scope();
  try {
    const warnings: string[] = [];
    const islands = findIslands(mesh, opts.slot, warnings);
    try {
      const r = cutIslands(mesh, islands, opts, scope, warnings);
      // hacimsiz parça (ör. yön bölgeye paralel) başarı sayılmaz
      const parts = r.parts.filter((p) => Math.abs(signedVolume(p)) >= 1e-3);
      if (parts.length < r.parts.length)
        r.warnings.push(`${r.parts.length - parts.length} hacimsiz parça atlandı.`);
      if (!parts.length)
        throw new CutError('Kesim hacimli bir parça üretmedi (yön bölgeye paralel olabilir).');
      return { ...r, parts };
    } catch (e) {
      // D5: hatanın hangi bölgede olduğunu göster
      if (e instanceof CutError && !e.loops) {
        e.loops = islands.flatMap((i) =>
          i.loops.map((loop) => loop.map((v) => vertexAt(mesh.positions, v))),
        );
      }
      throw e;
    }
  } finally {
    scope.dispose();
  }
}

function cutIslands(
  mesh: LabeledMesh,
  islands: Island[],
  opts: CutOptions,
  scope: Scope,
  warnings: string[],
): CutResult {
  {
    if (opts.mode === 'socket') return socketCut(mesh, islands, opts, scope, warnings);

    let body: Manifold;
    let parts: Manifold[];
    if (opts.planar) {
      ({ body, parts } = planeSplit(mesh, islands, scope, opts.faceGap ?? 0));
    } else {
      try {
        const split = capSplit(mesh, islands);
        body = scope.keep(toManifold(split.body, split.body.origin));
        parts = split.parts.map((p) => scope.keep(toManifold(p, p.origin)));
        if ((opts.faceGap ?? 0) > 0)
          warnings.push(
            'Yüz boşluğu düz kesimde uygulanır. Bu kesim çizgiyi izledi; yüzler birbirine değer.',
          );
      } catch (e) {
        if (!(e instanceof KernelError || e instanceof CutError)) throw e;
        // X4: sınırdan kapak olmadı, en uygun düzlemle kes
        ({ body, parts } = planeSplit(mesh, islands, scope, opts.faceGap ?? 0));
        warnings.push('Sınır halkasından kapak üretilemedi; bölge en uygun düzlemle kesildi.');
      }
    }

    if (opts.mode === 'keys') {
      const placed = pinCenters(mesh.positions, islands, opts.pins, opts.pin);
      for (const [k, { island, center, axis, spec }] of placed.entries()) {
        const i = islands.indexOf(island);
        const pin = makePin(spec, center, axis, 0, scope);
        const hole = makePin(spec, center, axis, opts.clearance, scope, pinDepthClearance(opts));
        checkPinContainment(
          pin,
          parts[i],
          body,
          spec,
          warnings,
          placed.length > 1 ? `Pim ${k + 1}` : 'Pim',
        );
        if (opts.pin.onPart) {
          parts[i] = scope.keep(parts[i].add(pin));
          body = scope.keep(body.subtract(hole));
        } else {
          body = scope.keep(body.add(pin));
          parts[i] = scope.keep(parts[i].subtract(hole));
        }
      }
    }
    return {
      body: fromManifoldMapped(body, mesh.labels, BASE_SLOT),
      parts: parts.map((p) => partFrom(p, mesh.labels, opts.slot)),
      warnings,
    };
  }
}

/** D3: kopuk parçaları ayrı mesh'lere böler. */
export function splitComponents(mesh: LabeledMesh): LabeledMesh[] {
  const adj = meshTopology(mesh).adj;
  const triCount = mesh.labels.length;
  const { component, count } = connectedComponents(triCount, adj);
  if (count <= 1) return [mesh];
  const groups: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triCount; t++) groups[component[t]].push(t);
  return groups.map((tris) => {
    const { mesh: sub } = extractTriangles(mesh, tris);
    const cut =
      mesh.cut && mesh.cut.length === triCount
        ? Uint8Array.from(tris, (t) => mesh.cut?.[t] ?? 0)
        : undefined;
    return {
      ...sub,
      labels: Uint16Array.from(tris, (t) => mesh.labels[t]),
      ...(cut ? { cut } : {}),
    };
  });
}

export interface CutSuggestion {
  mode: 'socket' | 'keys';
  /** Kesit (kesim halkası) eşdeğer yarıçapı, mm. */
  capRadius: number;
  /** Ortalama çıkıntı yüksekliği (hacim / kesit alanı), mm. */
  height: number;
  /** X72: bölgenin kalınlığı, 3 × hacim / yüzey alanı (kürede yarıçap), mm. */
  thickness: number;
  reason: string;
}

/** X72: kesit alanı bölge yüzeyinin bu oranından küçükse bölge çıkıntıdır (düz boya ~0,5). */
const PROTRUSION_CAP_RATIO = 0.3;
/** X72: pim sığması için en az kalınlık, mm (varsayılan pim yarıçapı 2 + tolerans + duvar). */
const MIN_KEYS_THICKNESS = 3;

/**
 * X5/X72: bölgenin biçimine göre kesim modu önerir. Kalın çıkıntıda (kol,
 * kafa, kulak) Keys; yüzeysel/sığ bölgede (göz, kaş, burun) ve pimin
 * sığmadığı ince çıkıntıda Socket. Kesit halkası eğri ya da küçük olabilir
 * (at başında yalnız kulak dipleri), bu yüzden ölçü halkadan değil bölgenin
 * hacmi ve yüzeyinden gelir. Hacim, bölge + düz kapaktan hesaplanır (boolean yok).
 */
export function suggestCutMode(mesh: LabeledMesh, slot: number): CutSuggestion | null {
  let islands: Island[];
  try {
    islands = findIslands(mesh, slot);
  } catch {
    return null;
  }
  const { areas } = meshTopology(mesh);
  // en büyük ada (yüzey alanı) belirleyici
  let best: { cap: number; surface: number; volume: number } | null = null;
  for (const island of islands) {
    const idx: number[] = [];
    let surface = 0;
    for (const t of island.tris) {
      idx.push(mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
      surface += areas[t];
    }
    let cap = 0;
    try {
      for (const loop of island.loops) {
        idx.push(...triangulateLoop(mesh.positions, loop));
        cap += loopPlane(mesh.positions, loop).area;
      }
    } catch {
      continue;
    }
    const volume = Math.abs(
      signedVolume({ positions: mesh.positions, indices: Uint32Array.from(idx) }),
    );
    if (!best || surface > best.surface) best = { cap, surface, volume };
  }
  if (!best || best.surface <= 0) return null;
  const { cap, surface, volume } = best;
  const capRadius = Math.sqrt(cap / Math.PI);
  const height = cap > 0 ? volume / cap : Infinity;
  const thickness = (3 * volume) / surface;
  const protrusion = cap < surface * PROTRUSION_CAP_RATIO;
  const keys = protrusion && thickness >= MIN_KEYS_THICKNESS;
  const t = thickness.toFixed(1);
  return {
    mode: keys ? 'keys' : 'socket',
    capRadius,
    height,
    thickness,
    reason: keys
      ? `kalın çıkıntı (kalınlık ~${t} mm): düz kesim + pim`
      : protrusion
        ? `ince çıkıntı (kalınlık ~${t} mm, pim sığmaz): tapa + yuva`
        : `yüzeysel bölge (yükseklik ~${height.toFixed(1)} mm): tapa + yuva`,
  };
}
