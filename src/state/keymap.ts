import { create } from 'zustand';

/** Kısayol atanabilen komutlar (E2). Geri al/yinele (Ctrl/Cmd+Z) ve slot seçimi (0–9) sabittir. */
export type Command =
  | 'tool.smart'
  | 'tool.brush'
  | 'tool.erase'
  | 'tool.smooth'
  | 'tool.bucket'
  | 'tool.pin'
  | 'tool.line'
  | 'tool.seam'
  | 'preview'
  | 'fit'
  | 'brush.smaller'
  | 'brush.larger'
  | 'part.hide'
  | 'part.solo'
  | 'part.showAll'
  | 'view.explode'
  | 'help'
  | 'slot.clear'
  | 'pin.move'
  | 'pin.rotate';

export const COMMANDS: { id: Command; label: string }[] = [
  { id: 'tool.smart', label: 'Smart Fill' },
  { id: 'tool.brush', label: 'Fırça' },
  { id: 'tool.erase', label: 'Silgi' },
  { id: 'tool.smooth', label: 'Yumuşat' },
  { id: 'tool.bucket', label: 'Kova' },
  { id: 'tool.pin', label: 'Pim' },
  { id: 'tool.line', label: 'Çizgi' },
  { id: 'tool.seam', label: 'Dikiş' },
  { id: 'preview', label: 'Önizleme' },
  { id: 'fit', label: 'Görünümü sığdır' },
  { id: 'brush.smaller', label: 'Fırça küçült' },
  { id: 'brush.larger', label: 'Fırça büyüt' },
  { id: 'part.hide', label: 'Seçili parçayı gizle' },
  { id: 'part.solo', label: 'Yalnız seçili parça (tekrar: hepsi)' },
  { id: 'part.showAll', label: 'Tüm parçaları göster' },
  { id: 'view.explode', label: 'Ayrık görünüm aç/kapa' },
  { id: 'help', label: 'Yardım' },
  { id: 'slot.clear', label: 'Aktif slotun seçimini temizle' },
  { id: 'pin.move', label: 'Pim: taşıma tutamağı' },
  { id: 'pin.rotate', label: 'Pim: döndürme tutamağı' },
];

export const DEFAULT_KEYMAP: Record<Command, string> = {
  'tool.smart': 'F',
  'tool.brush': 'B',
  'tool.erase': 'E',
  'tool.smooth': 'S',
  'tool.bucket': 'G',
  'tool.pin': 'P',
  'tool.line': 'L',
  'tool.seam': 'D',
  preview: 'Space',
  fit: 'Home',
  'brush.smaller': '[',
  'brush.larger': ']',
  'part.hide': 'H',
  'part.solo': 'Shift+H',
  'part.showAll': 'U',
  'view.explode': 'X',
  help: '?',
  'slot.clear': 'Delete',
  'pin.move': 'W',
  'pin.rotate': 'R',
};

/** Klavye olayının kısayol adı: tek karakterler büyük harf, boşluk "Space", Shift'li harf "Shift+H". */
export function keyName(e: { key: string; shiftKey?: boolean }): string {
  if (e.key === ' ') return 'Space';
  if (e.key.length !== 1) return e.key;
  const k = e.key.toLocaleUpperCase('en');
  // harflerde Shift ayrı kısayoldur; ?, [ gibi işaretlerde Shift zaten karakterin parçası
  return e.shiftKey && k !== e.key.toLocaleLowerCase('en') ? `Shift+${k}` : k;
}

/** Atanamayan tuşlar: sabit kısayollar ve değiştirici tuşlar. */
export function isReservedKey(key: string): boolean {
  return (
    /^[0-9]$/.test(key) ||
    ['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'Tab', 'CapsLock'].includes(key)
  );
}

/** Kısayol yakalama sırasında (Kısayollar panelinde "Değiştir") genel kısayollar susar. */
export const shortcutCapture = { active: false };

const STORAGE_KEY = '3dsplit.keymap';

function load(): Record<Command, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_KEYMAP, ...JSON.parse(raw) };
  } catch {
    // depolama kapalı: varsayılan
  }
  return { ...DEFAULT_KEYMAP };
}

export const useKeymap = create<{ map: Record<Command, string> }>(() => ({ map: load() }));

function save(map: Record<Command, string>): void {
  useKeymap.setState({ map });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // depolama kapalı: sadece bu oturum
  }
}

/** Komuta tuş atar; tuş başka komuttaysa ikisi yer değiştirir. Değişen diğer komutu döndürür. */
export function assignKey(command: Command, key: string): Command | null {
  const map = { ...useKeymap.getState().map };
  const other =
    (Object.keys(map) as Command[]).find((c) => c !== command && map[c] === key) ?? null;
  if (other) map[other] = map[command];
  map[command] = key;
  save(map);
  return other;
}

export function resetKeymap(): void {
  save({ ...DEFAULT_KEYMAP });
}

/** Tuşun bağlı olduğu komut. */
export function commandFor(key: string): Command | null {
  const map = useKeymap.getState().map;
  return (Object.keys(map) as Command[]).find((c) => map[c] === key) ?? null;
}
