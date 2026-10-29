import { set, useStore } from '../state/store';

const mm = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/**
 * X116: son deneme parçasının çentik → boşluk eşlemesi. Basılı parçada en iyi oturan
 * deliğin çentiği sayılıp düğmeyle seçilir; tolerans o değer olur.
 */
export function CouponPicker({ label }: { label?: string }) {
  const last = useStore((s) => s.lastCoupon);
  const clearance = useStore((s) => s.cut.clearance);
  if (!last) return null;
  return (
    <div className="coupon-picker">
      <span>
        {label ??
          `Son deneme parçası (${last.mode === 'keys' ? 'Pimli kes' : 'Tapa'}, ${last.pinText}):`}
      </span>
      <div className="row segmented">
        {last.clearances.map((c, i) => (
          <button
            key={c}
            type="button"
            className={Math.abs(clearance - c) < 1e-6 ? 'active' : ''}
            title={`Tolerans ${mm(c)} mm olur`}
            onClick={() => set((s) => ({ cut: { ...s.cut, clearance: c } }))}
          >
            {i + 1} çentik {mm(c)}
          </button>
        ))}
      </div>
    </div>
  );
}
