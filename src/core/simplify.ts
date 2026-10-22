import { fromManifold, toManifold } from './kernel';
import { meanEdgeLength } from './paint';
import { BASE_SLOT, type LabeledMesh } from './types';

/**
 * X96: büyük modeli hedef üçgen sayısının altına sadeleştirir. Manifold `simplify`
 * yüzeyi en çok `tolerans` kadar oynatır; tolerans ortalama kenarın %1'inden başlar,
 * hedefe inene kadar ikiye katlanır (en çok 8 deneme): hedefin çok altına inilmez,
 * seçim kenarları için üçgen kalır. Boya etiketleri faceID ile taşınır.
 */
export function simplifyMesh(
  mesh: LabeledMesh,
  targetTriangles: number,
): { mesh: LabeledMesh; tolerance: number } {
  const man = toManifold(mesh, mesh.labels);
  try {
    let tolerance = meanEdgeLength(mesh) * 0.01;
    let best: { mesh: LabeledMesh; tolerance: number } | null = null;
    for (let i = 0; i < 8; i++) {
      const s = man.simplify(tolerance);
      const out = fromManifold(s, BASE_SLOT);
      s.delete();
      best = { mesh: out, tolerance };
      if (out.labels.length <= targetTriangles) break;
      tolerance *= 2;
    }
    return best as { mesh: LabeledMesh; tolerance: number };
  } finally {
    man.delete();
  }
}
