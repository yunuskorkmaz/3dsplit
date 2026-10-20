/**
 * X75: kesimden çıkan küçük parçalar. Boyanın içine düşen ayrı kabuklar
 * (kayış, göz) ayrı parça olmaz, kutusu içinde kaldığı büyük parçaya katılır;
 * hacmi çok küçük kırıntılar atılır.
 */
import { boundingBox, signedVolume } from './geometry';
import type { LabeledMesh } from './types';

/** Bu hacmin altındaki parça basılamaz kırıntıdır, mm³. */
export const DEBRIS_VOLUME = 0.5;
/** Kutusunun bu oranı büyük parçanın kutusunda kalan parça ona katılır. */
const NESTED_BOX_RATIO = 0.6;

type Box = ReturnType<typeof boundingBox>;

function boxVolume(b: Box): number {
  return (
    Math.max(0, b.max[0] - b.min[0]) *
    Math.max(0, b.max[1] - b.min[1]) *
    Math.max(0, b.max[2] - b.min[2])
  );
}

/** `a` kutusunun `b` kutusu içinde kalan oranı. Yassı kutuda (hacim 0) eksen eksen bakılır. */
function insideRatio(a: Box, b: Box): number {
  let ratio = 1;
  for (let k = 0; k < 3; k++) {
    const len = a.max[k] - a.min[k];
    const overlap = Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]);
    if (overlap < 0) return 0;
    ratio *= len > 1e-9 ? overlap / len : 1;
  }
  return ratio;
}

export function mergeNestedParts(parts: LabeledMesh[], warnings: string[]): LabeledMesh[] {
  const info = parts.map((mesh) => ({
    mesh,
    volume: Math.abs(signedVolume(mesh)),
    box: boundingBox(mesh.positions),
  }));
  const kept = info.filter((p) => p.volume >= DEBRIS_VOLUME);
  if (kept.length && kept.length < info.length)
    warnings.push(`${info.length - kept.length} kırıntı parça atıldı (${DEBRIS_VOLUME} mm³ altı).`);
  // hepsi kırıntıysa kesim anlamsız değil: en azından en büyüğü kalır
  const pool = kept.length
    ? kept
    : info
        .slice()
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 1);
  pool.sort((a, b) => b.volume - a.volume);
  const groups: { host: (typeof pool)[number]; guests: LabeledMesh[] }[] = [];
  for (const p of pool) {
    const host = groups.find(
      (g) =>
        boxVolume(g.host.box) > boxVolume(p.box) &&
        insideRatio(p.box, g.host.box) >= NESTED_BOX_RATIO,
    );
    if (host) host.guests.push(p.mesh);
    else groups.push({ host: p, guests: [] });
  }
  const merged = groups.reduce((n, g) => n + g.guests.length, 0);
  if (merged) warnings.push(`İçinde kalan ${merged} ayrı kabuk ana parçaya katıldı.`);
  return groups.map((g) => (g.guests.length ? stack([g.host.mesh, ...g.guests]) : g.host.mesh));
}

/**
 * Kabuklar boolean olmadan tek mesh'e konur: her kabuk kendi başına kapalı,
 * kesişseler de dilimleyici birleşik basar. Büyük parçada boolean birleşim kesimi iki katına uzatıyordu.
 */
function stack(meshes: LabeledMesh[]): LabeledMesh {
  const labels = concat(
    meshes.map((m) => m.labels),
    Uint16Array,
  );
  const cut = concat(
    meshes.map((m) => m.cut ?? new Uint8Array(m.labels.length)),
    Uint8Array,
  );
  const positions = concat(
    meshes.map((m) => m.positions),
    Float32Array,
  );
  const indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0));
  let at = 0;
  let base = 0;
  for (const m of meshes) {
    for (let i = 0; i < m.indices.length; i++) indices[at + i] = m.indices[i] + base;
    at += m.indices.length;
    base += m.positions.length / 3;
  }
  return { positions, indices, labels, cut };
}

function concat<T extends Uint8Array | Uint16Array | Float32Array>(
  arrays: T[],
  Ctor: new (n: number) => T,
): T {
  const out = new Ctor(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a as never, at);
    at += a.length;
  }
  return out;
}
