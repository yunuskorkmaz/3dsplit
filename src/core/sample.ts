/**
 * X83: "Örnek modeli aç" figürü: baş, burun, gövde, kalça, kollar.
 * `samples/make-figure.mjs` ile aynı biçim; dosya yok, tarayıcıda üretilir.
 */
import { fromManifold, kernel } from './kernel';
import type { LabeledMesh } from './types';

export function sampleFigure(): LabeledMesh {
  const { Manifold } = kernel();
  const head = Manifold.sphere(14, 64).translate([0, 0, 62]);
  const body = Manifold.cylinder(40, 16, 12, 64).translate([0, 0, 10]);
  const hips = Manifold.sphere(16, 64).scale([1, 0.8, 0.6]).translate([0, 0, 10]);
  const arm = Manifold.cylinder(34, 5, 4, 32).rotate([0, 90, 0]);
  const armL = arm.translate([10, 0, 42]);
  const armR = arm.rotate([0, 0, 180]).translate([-10, 0, 42]);
  const nose = Manifold.sphere(3, 24).translate([0, -14, 62]);
  const parts = [head, body, hips, arm, armL, armR, nose];
  const union = Manifold.union([head, body, hips, armL, armR, nose]);
  const fig = union.refineToLength(1.5);
  const mesh = fromManifold(fig, 0);
  for (const m of [...parts, union, fig]) m.delete();
  // manifold'un kendi yüz numaraları etiket değil: model boyasız açılır
  mesh.labels.fill(0);
  return mesh;
}
