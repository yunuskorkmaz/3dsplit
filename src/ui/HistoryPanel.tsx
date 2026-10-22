import { useEffect, useRef } from 'react';
import { jumpToHistory } from '../state/actions';
import { type HistoryEntry, historyLabel, useStore } from '../state/store';
import { Icon, type IconName } from './icons';

/** Adımın simgesi: kayıt türü ve adından. */
function historyIcon(e: HistoryEntry): IconName {
  const label = historyLabel(e);
  if (e.kind === 'geometry') return 'smooth';
  if (e.kind === 'split') return 'refine';
  if (e.kind === 'pins') return 'pin';
  if (e.kind === 'removeSlot') return 'trash';
  if (e.kind === 'paint') {
    if (label.startsWith('Silgi') || label.includes('(sil)') || label === 'Seçimi temizle')
      return 'erase';
    if (label.startsWith('Kova') || label.startsWith('Gap')) return 'bucket';
    if (label.startsWith('Smart')) return 'smart';
    if (label.startsWith('Çıkıntı')) return 'suggest';
    if (label.startsWith('Çizgi')) return 'line';
    return 'brush';
  }
  if (label.startsWith('Kes ')) {
    if (label.includes('· Dikiş')) return 'seam';
    if (label.includes('· Tapa')) return 'socket';
    if (label.includes('· Pimli')) return 'keys';
    return 'fast';
  }
  if (label.startsWith('Aç')) return 'open';
  if (label.startsWith('İncelt')) return 'refine';
  if (label.includes('onar')) return 'repair';
  if (label.startsWith('Kopuk')) return 'split';
  if (label.startsWith('Deneme')) return 'coupon';
  if (label.startsWith('Baskı boyu')) return 'printSize';
  if (label.startsWith('Parça sil')) return 'trash';
  if (label.includes('yumuşat')) return 'smooth';
  return 'parts';
}

/** Boyama adımının rengi: boyanan ilk renk. Silme ya da başka adımda yok. */
function useStepColor(e: HistoryEntry): string | undefined {
  const slots = useStore((s) => s.slots);
  if (e.kind !== 'paint') return undefined;
  const id = e.after.find((l) => l !== 0);
  return id ? slots.find((s) => s.id === id)?.color : undefined;
}

function Step(props: { e: HistoryEntry; index: number; done: boolean; current: boolean }) {
  const color = useStepColor(props.e);
  const label = historyLabel(props.e);
  return (
    <li className={`${props.done ? '' : 'undone'}${props.current ? ' current' : ''}`}>
      <button
        type="button"
        aria-label={`${props.index}. ${label}`}
        title={`${props.index}. ${label} — ${props.done ? 'bu adıma geri dön' : 'bu adıma kadar yinele'}`}
        onClick={() => jumpToHistory(props.index)}
        style={color ? { color } : undefined}
      >
        <Icon name={historyIcon(props.e)} size={18} />
      </button>
    </li>
  );
}

/**
 * X88: en altta geçmiş şeridi. Her adım bir simge (boyamada renk o rengin); bulunulan adımdan
 * sonra mavi çizgi, geri alınmış adımlar soluk. Tıklanan adıma gidilir.
 */
export function HistoryBar() {
  const undo = useStore((s) => s.undoStack);
  const redo = useStore((s) => s.redoStack);
  const list = useRef<HTMLOListElement>(null);
  // yinele yığını en yeni geri alınan en üstte: zaman sırası için ters çevrilir
  const future = [...redo].reverse();
  const rows = [
    ...undo.map((e) => ({ e, done: true })),
    ...future.map((e) => ({ e, done: false })),
  ];
  const total = rows.length;
  const at = undo.length;
  // son adım hep görünsün; geri alırken bulunulan adım görünür kalsın
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const cur = el.querySelector('li.current') ?? el.lastElementChild;
    cur?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [at, total]);
  return (
    <div className="history-bar" role="toolbar" aria-label="Geçmiş">
      <span className="hname">Geçmiş</span>
      <div className="hnav">
        <button
          type="button"
          aria-label="Başa"
          title="Bütün adımları geri al"
          disabled={at === 0}
          onClick={() => jumpToHistory(0)}
        >
          |◀
        </button>
        <button
          type="button"
          aria-label="Geri"
          title="Bir adım geri (Ctrl/Cmd+Z)"
          disabled={at === 0}
          onClick={() => jumpToHistory(at - 1)}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="İleri"
          title="Bir adım ileri (Ctrl/Cmd+Shift+Z)"
          disabled={at === total}
          onClick={() => jumpToHistory(at + 1)}
        >
          ▶
        </button>
        <button
          type="button"
          aria-label="Sona"
          title="Bütün adımları yinele"
          disabled={at === total}
          onClick={() => jumpToHistory(total)}
        >
          ▶|
        </button>
      </div>
      <ol className="history" ref={list}>
        <li className={at === 0 ? 'current' : ''}>
          <button
            type="button"
            aria-label="Başlangıç"
            title="Başlangıç: bütün adımları geri al"
            onClick={() => jumpToHistory(0)}
          >
            <Icon name="start" size={18} />
          </button>
        </li>
        {rows.map((r, i) => (
          <Step key={i} e={r.e} index={i + 1} done={r.done} current={i === at - 1} />
        ))}
      </ol>
      <span className="hcount">
        {at}/{total}
      </span>
    </div>
  );
}
