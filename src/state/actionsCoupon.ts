import type { PinShape } from '../core/cut';
import { write3mfBambu } from '../io/bambu3mf';
import { downloadBytes, type ExportObject, write3mf, writeStlZip } from '../io/exportFile';
import { geometry } from '../worker/client';
import { busy } from './actionsHooks';
import { type CouponView, get, notify, set } from './store';

// ---------- tolerans deneme parçası (X35, X115) ----------

const SHAPE_NAMES: Record<PinShape, string> = {
  cylinder: 'silindir',
  cube: 'küp',
  octagon: 'sekizgen',
  snap: 'snap',
};

const mm = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Boşluğun −0,1, kendisi ve +0,1 mm'si (tekrarsız). */
export function couponClearances(c: number): number[] {
  return [...new Set([Math.max(0, c - 0.1), c, c + 0.1].map((x) => Math.round(x * 100) / 100))];
}

let couponCounter = 0;

/**
 * X115: deneme görünümünü açar ya da `mode` ile yeniden üretir. Tapa: Ø8 silindir;
 * Pimli kes: kesim ayarlarındaki pim. Model yokken de çalışır; sahneye girmez.
 */
export async function openCoupon(mode?: 'socket' | 'keys'): Promise<void> {
  const { cut } = get();
  const m = mode ?? get().coupon?.mode ?? (cut.mode === 'keys' ? 'keys' : 'socket');
  const clearances = couponClearances(cut.clearance);
  const pin =
    m === 'keys'
      ? {
          shape: cut.pinShape,
          radius: cut.pinRadius,
          length: cut.pinLength,
          onPart: true,
          chamfer: cut.pinChamfer,
        }
      : {
          shape: 'cylinder' as const,
          radius: 4,
          length: 2 * cut.depth,
          onPart: true,
          chamfer: 0.4,
        };
  const depthClearance = m === 'keys' ? cut.pinDepthClearance : cut.clearance;
  await busy('Deneme parçası hazırlanıyor…', async () => {
    const coupon = await geometry.coupon(pin, clearances, depthClearance);
    const label = clearances.map(mm).join(' / ');
    const view: CouponView = {
      mode: m,
      clearances,
      pinText: `${SHAPE_NAMES[pin.shape]} Ø${mm(2 * pin.radius)} × ${mm(pin.length)} mm`,
      parts: [
        {
          id: `coupon${++couponCounter}`,
          name: `Tolerans plakası (${label} mm)`,
          mesh: coupon.plate,
        },
        ...coupon.pins.map((mesh, i) => ({
          id: `coupon${++couponCounter}`,
          name: `Tolerans pimi ${i + 1}`,
          mesh,
        })),
      ],
    };
    set({ coupon: view, previewActive: false, preview: null });
  });
}

/** X115: deneme görünümünden modele döner; deneme parçası atılır. */
export function closeCoupon(): void {
  if (get().coupon) set({ coupon: null });
}

function couponObjects(): ExportObject[] {
  return (get().coupon?.parts ?? []).map((p) => ({
    name: p.name,
    mesh: p.mesh,
    color: '#b0b0b0',
  }));
}

const FILE = 'tolerans-deneme';

/** X115: deneme parçasını indirir; dosyada yalnız plaka ve pimler var. */
export function exportCoupon(format: 'bambu' | 'generic' | 'stl'): void {
  const objs = couponObjects();
  if (!objs.length) return;
  if (format === 'bambu') {
    downloadBytes(write3mfBambu(objs, { title: FILE }), `${FILE}.3mf`, 'model/3mf');
  } else if (format === 'generic') downloadBytes(write3mf(objs), `${FILE}.3mf`, 'model/3mf');
  else downloadBytes(writeStlZip(objs), `${FILE}.zip`, 'application/zip');
  notify('info', `Deneme parçası indirildi: ${objs.length} parça.`);
}
