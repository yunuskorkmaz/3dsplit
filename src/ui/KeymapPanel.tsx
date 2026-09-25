import { useState } from 'react';
import {
  assignKey,
  COMMANDS,
  type Command,
  isReservedKey,
  keyName,
  resetKeymap,
  shortcutCapture,
  useKeymap,
} from '../state/keymap';
import { notify } from '../state/store';

/** E2: kısayolları değiştirme. "Değiştir"e basıp yeni tuşa basılır; çakışan kısayolla yer değiştirir. */
export function KeymapEditor() {
  const map = useKeymap((s) => s.map);
  const [capturing, setCapturing] = useState<Command | null>(null);

  const capture = (cmd: Command) => {
    setCapturing(cmd);
    shortcutCapture.active = true;
    const onKey = (e: KeyboardEvent) => {
      // tek başına Shift/Option: asıl tuşu bekle
      if (e.key === 'Shift' || e.key === 'Alt') return;
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', onKey, true);
      shortcutCapture.active = false;
      setCapturing(null);
      const key = keyName(e);
      if (e.key === 'Escape') return;
      const altLetter = e.altKey && (e.key.length !== 1 || /[\p{L}\p{N}]/u.test(e.key));
      if (isReservedKey(key) || e.metaKey || e.ctrlKey || altLetter) {
        notify('warn', `${key} atanamaz (0–9 slotlar, değiştirici tuşlar ve Esc ayrılmış).`);
        return;
      }
      const swapped = assignKey(cmd, key);
      if (swapped)
        notify(
          'info',
          `${key} önceden "${COMMANDS.find((c) => c.id === swapped)?.label}" komutundaydı; yer değiştirdiler.`,
        );
    };
    window.addEventListener('keydown', onKey, true);
  };

  return (
    <>
      <ul className="keymap">
        {COMMANDS.map((c) => (
          <li key={c.id}>
            <span>{c.label}</span>
            <kbd>{capturing === c.id ? '…' : map[c.id]}</kbd>
            <button type="button" onClick={() => capture(c.id)} disabled={capturing !== null}>
              {capturing === c.id ? 'Tuşa bas' : 'Değiştir'}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={resetKeymap}>
        Varsayılana dön
      </button>
    </>
  );
}
