import { closeCoupon, exportCoupon, openCoupon } from '../state/actions';
import { useStore } from '../state/store';

const mm = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** X115: deneme görünümünün şeridi: mod, boşluklar, indir, kapat. */
export function CouponBar() {
  const coupon = useStore((s) => s.coupon);
  const busy = useStore((s) => !!s.busy);
  if (!coupon) return null;
  const notches = coupon.clearances.map((_, i) => i + 1).join(', ');
  return (
    <div className="coupon-bar" role="toolbar" aria-label="Tolerans deneme parçası">
      <b>Tolerans deneme parçası</b>
      <div className="row segmented">
        {(
          [
            ['socket', 'Tapa'],
            ['keys', 'Pimli kes'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={coupon.mode === id ? 'active' : ''}
            disabled={busy}
            onClick={() => coupon.mode !== id && openCoupon(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="coupon-info">
        Pim: {coupon.pinText} · boşluklar {coupon.clearances.map(mm).join(' / ')} mm (soldan{' '}
        {notches} çentik)
      </span>
      <details className="menu">
        <summary>İndir ▾</summary>
        <div className="menu-list">
          {(
            [
              ['bambu', '3MF — Bambu Studio / OrcaSlicer'],
              ['generic', '3MF — genel'],
              ['stl', 'STL (ZIP)'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                exportCoupon(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      <button type="button" onClick={closeCoupon} title="Modele dön (Esc)">
        Kapat
      </button>
    </div>
  );
}
