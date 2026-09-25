import { jumpToHistory } from '../state/actions';
import { historyLabel, useStore } from '../state/store';
import { Panel } from './Panel';

/**
 * Geçmiş zaman çizelgesi: yapılan adımlar sırayla listelenir, tıklanan
 * adıma gidilir (aradaki adımlar tek tek geri alınır / yinelenir). Geri
 * alınmış adımlar soluk görünür; yeni bir işlem yapılınca silinir.
 */
export function HistoryPanel() {
  const undo = useStore((s) => s.undoStack);
  const redo = useStore((s) => s.redoStack);
  // yinele yığını en yeni geri alınan en üstte: zaman sırası için ters çevrilir
  const future = [...redo].reverse();
  const rows = [
    ...undo.map((e) => ({ e, done: true })),
    ...future.map((e) => ({ e, done: false })),
  ];
  return (
    <Panel
      id="history"
      title={`Geçmiş${undo.length ? ` (${undo.length})` : ''}`}
      defaultOpen={false}
    >
      <ol className="history">
        <li className={undo.length === 0 ? 'current' : ''}>
          <button type="button" onClick={() => jumpToHistory(0)} title="Tüm adımları geri al">
            Başlangıç
          </button>
        </li>
        {rows.map((r, i) => (
          <li
            key={i}
            className={`${r.done ? '' : 'undone'}${i === undo.length - 1 ? ' current' : ''}`}
          >
            <button
              type="button"
              onClick={() => jumpToHistory(i + 1)}
              title={r.done ? 'Bu adıma geri dön' : 'Bu adıma kadar yinele'}
            >
              <span className="step">{i + 1}</span>
              {historyLabel(r.e)}
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">
        Bir adıma tıkla: o ana dönülür. Soluk adımlar geri alınmış; yeni işlem yapınca silinir.
      </p>
    </Panel>
  );
}
