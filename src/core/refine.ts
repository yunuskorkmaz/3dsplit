import { faceNormalsAndAreas } from './geometry';
import { fromManifold, toManifold } from './kernel';
import { BASE_SLOT, type LabeledMesh } from './types';

/** İnceltme sonrası izin verilen en fazla üçgen sayısı. */
export const MAX_REFINED_TRIANGLES = 3_000_000;

/** Kenar uzunluğu `edgeLength` olan eşkenar üçgenlerle yüzeyi kaplamak için gereken yaklaşık üçgen sayısı. */
export function estimateRefinedTriangles(mesh: LabeledMesh, edgeLength: number): number {
  const { areas } = faceNormalsAndAreas(mesh);
  let total = 0;
  for (let t = 0; t < areas.length; t++) total += areas[t];
  const triArea = (Math.sqrt(3) / 4) * edgeLength * edgeLength;
  return Math.max(mesh.labels.length, Math.round(total / triArea));
}

/**
 * Üçgenleri kenarlar yaklaşık `edgeLength` olacak şekilde böler (köşegenler biraz uzun kalabilir).
 * Etiketler faceID üzerinden korunur; şekil değişmez (düz bölme).
 */
export function refineMesh(mesh: LabeledMesh, edgeLength: number): LabeledMesh {
  if (!(edgeLength > 0)) throw new Error('Kenar uzunluğu pozitif olmalı.');
  const estimate = estimateRefinedTriangles(mesh, edgeLength);
  if (estimate > MAX_REFINED_TRIANGLES) {
    throw new Error(
      `Bu kenar uzunluğu yaklaşık ${(estimate / 1e6).toFixed(1)}M üçgen üretir (sınır ${MAX_REFINED_TRIANGLES / 1e6}M). Daha büyük bir değer seçin.`,
    );
  }
  const man = toManifold(mesh, mesh.labels);
  const refined = man.refineToLength(edgeLength);
  try {
    return fromManifold(refined, BASE_SLOT);
  } finally {
    refined.delete();
    man.delete();
  }
}
