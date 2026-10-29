import { useMemo } from 'react';
import { set, useStore } from '../state/store';

type Step = 'open' | 'select' | 'cut' | 'export';

const STEPS: { id: Step; label: string; title: string }[] = [
  { id: 'open', label: 'Aç', title: 'STL, OBJ ya da 3MF aç' },
  { id: 'select', label: 'Seç', title: 'Ayrı basılacak bölgeyi boya (Akıllı seç)' },
  { id: 'cut', label: 'Kes', title: 'Tapa, Pimli kes ya da Yapıştır ile kes' },
  { id: 'export', label: 'Aktar', title: "Parçaları slicer'a aktar" },
];

/**
 * Bulunulan adım: parça yok → Aç; kesimden yeni parça var → Aktar; aktif setin boyası
 * var → Kes; yoksa Seç. X104: başka setlerin boyası (boyalı 3MF) Kes'e geçirmez.
 */
function useStep(): Step {
  return useStore((s) => {
    if (!s.parts.length) return 'open';
    if (s.parts.some((p) => p.badge === 'new')) return 'export';
    const part = s.parts.find((p) => p.id === s.selectedPartId);
    const slot = s.activeSlot;
    return slot !== 0 && part?.mesh.labels.includes(slot) ? 'cut' : 'select';
  });
}

/**
 * X124: sahne birden çok gövdeden oluşuyor, hiçbiri boyalı ya da kesilmiş değil:
 * gövdeler zaten ayrı parça, Aktar da hazır.
 */
function useSplitModel(): boolean {
  const parts = useStore((s) => s.parts);
  const paintVersion = useStore((s) => s.paintVersion);
  return useMemo(() => {
    void paintVersion;
    if (parts.length < 2 || parts.some((p) => p.badge)) return false;
    return parts.every((p) => !p.mesh.labels.some((l) => l !== 0));
  }, [parts, paintVersion]);
}

/** Adımın düğmesini gösterir: dosya penceresi, Akıllı seç, Kes düğmesi, Dışa aktar menüsü. */
function goTo(step: Step): void {
  if (step === 'open') document.getElementById('open-model')?.click();
  else if (step === 'select') set({ tool: 'smart' });
  else if (step === 'cut') flash(document.querySelector<HTMLElement>('.cut-actions .primary'));
  else {
    const menu = document.querySelector<HTMLDetailsElement>('details.menu');
    if (menu) menu.open = true;
  }
}

function flash(el: HTMLElement | null): void {
  if (!el) return;
  el.focus();
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

/** X83: üst şeritte Aç → Seç → Kes → Aktar; bulunulan adım vurgulu, geçilenler işaretli. */
export function StepBar() {
  const current = useStep();
  const at = STEPS.findIndex((s) => s.id === current);
  const split = useSplitModel();
  return (
    <ol className="step-bar" aria-label="Adımlar">
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          className={
            i < at ? 'done' : i === at ? 'current' : s.id === 'export' && split ? 'ready' : ''
          }
        >
          <button
            type="button"
            title={
              s.id === 'export' && split
                ? 'Gövdeler zaten ayrı parça: kesmeden aktarabilirsin'
                : s.title
            }
            aria-label={`Adım: ${s.label}`}
            aria-current={i === at ? 'step' : undefined}
            onClick={() => goTo(s.id)}
          >
            {i < at ? '✓ ' : ''}
            {s.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
