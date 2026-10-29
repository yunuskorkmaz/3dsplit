import { makePin, type PinOptions } from './cut';
import { fromManifold, kernel, Scope } from './kernel';
import type { LabeledMesh } from './types';

export interface Coupon {
  /** Farklı boşluklarda delikli plaka. */
  plate: LabeledMesh;
  /** Plakanın yanında dik duran pimler (her delik için bir tane). */
  pins: LabeledMesh[];
}

/**
 * X116: deneme parçasının boşlukları, soldan sağa: −0,1, kendisi, +0,1 mm. Alt değer
 * 0'ın altına düşerse üçü yukarı kayar (0 → 0 / 0,1 / 0,2); hep üç delik.
 */
export function couponClearances(c: number): number[] {
  const lo = c - 0.1 < -1e-9 ? c : c - 0.1;
  return [lo, lo + 0.1, lo + 0.2].map((x) => Math.round(x * 100) / 100);
}

/**
 * X35: tolerans deneme parçası. Seçili pim şekli ve boyutuyla, her
 * `clearances[i]` boşluğu için bir delik açılmış plaka ve aynı sayıda pim.
 * Deliğin önündeki (i+1) çentik hangi boşluk olduğunu gösterir (soldan
 * sağa artan). Delik derinliği pim boyunun yarısı + boy boşluğu; plaka
 * altında 1.2 mm taban kalır. Plaka z=0'da, x ekseni boyunca uzanır.
 */
export function toleranceCoupon(
  pin: PinOptions,
  clearances: number[],
  depthClearance: number,
): Coupon {
  const { Manifold } = kernel();
  const scope = new Scope();
  try {
    const r = pin.radius;
    const half = pin.length / 2;
    const pitch = 2 * r + 2 * Math.max(0.5, ...clearances) + 4;
    const width = pitch * clearances.length + 2;
    const depth = 2 * r + 10;
    const height = half + depthClearance + 1.2;
    let plate = scope.keep(Manifold.cube([width, depth, height], false));
    const mark = Math.max(0.6, Math.min(1, r / 3));
    clearances.forEach((c, i) => {
      const x = 1 + pitch * (i + 0.5);
      const y = depth / 2 + 1.5;
      // pim merkezi plakanın üst yüzünde, ekseni aşağı: yarısı delikte
      const hole = makePin(pin, [x, y, height], [0, 0, -1], c, scope, depthClearance);
      plate = scope.keep(plate.subtract(hole));
      // çentikler: plakanın önünde (i+1) tane yarım küre çukur
      for (let k = 0; k <= i; k++) {
        const dot = scope.keep(
          Manifold.sphere(mark, 16).translate([x + (k - i / 2) * mark * 2.5, 2.5, height]),
        );
        plate = scope.keep(plate.subtract(dot));
      }
    });
    const pins: LabeledMesh[] = clearances.map((_, i) => {
      const x = 1 + pitch * (i + 0.5);
      // pim plakanın arkasında dik durur, tabanı z=0
      const p = makePin({ ...pin, onPart: true }, [x, depth + 3 + r, half], [0, 0, 1], 0, scope);
      return fromManifold(p, 0);
    });
    const plateMesh = fromManifold(plate, 0);
    plateMesh.labels.fill(0);
    for (const p of pins) p.labels.fill(0);
    return { plate: plateMesh, pins };
  } finally {
    scope.dispose();
  }
}
