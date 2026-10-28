import { useEffect, useMemo, useRef, useState } from 'react';
import type { CutMode } from '../core/cut';
import {
  activePaintCount,
  addSlot,
  autoSuggestFeatures,
  clearActiveSlot,
  export3mf,
  export3mfGeneric,
  exportPartStl,
  exportStlZip,
  openSample,
  redo,
  refineSelected,
  restoreSession,
  runCut,
  SIMPLIFY_TARGET,
  saveProject,
  simplifyParts,
  splitSelected,
  toggleExplode,
  togglePreview,
  undo,
  voxelRepairSelected,
} from '../state/actions';
import { useKeymap } from '../state/keymap';
import {
  get,
  type AppState as State,
  set,
  setCameraPrefs,
  type Tool,
  useStore,
} from '../state/store';
import { Icon, type IconName } from './icons';
import { TOOLS } from './Toolbar';
import { fitAll, fitPart, fitView, viewToward } from './ViewportHost';

const RECENT_KEY = '3dsplit.recentCommands';

type Item = {
  id: string;
  label: string;
  /** Aramada adla birlikte bakılan ek sözcükler. */
  words?: string;
  icon?: IconName;
  keys?: string;
  /** Çalışmıyorsa nedeni. */
  blocked?: (s: State) => string | null;
  run: () => void;
};

/** Türkçe harf ve büyük/küçük duyarsız arama biçimi: "Yapıştır" → "yapistir". */
export function foldTurkish(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const noParts = (s: State) => (s.parts.length ? null : 'parça yok');
const noSelection = (s: State) => (s.selectedPartId ? null : 'seçili parça yok');
const noPaint = (s: State) =>
  s.tool === 'seam' && s.line.closed && !s.line.bad
    ? null
    : !s.parts.length
      ? 'parça yok'
      : s.activeSlot === 0
        ? 'seçim seti seçilmedi'
        : activePaintCount() === 0
          ? 'boyalı bölge yok'
          : null;

function setMode(mode: CutMode): void {
  set((s) => ({ cut: { ...s.cut, mode }, cutModeManual: true }));
}

function useItems(): Item[] {
  const keys = useKeymap((s) => s.map);
  return useMemo(() => {
    const tools: Item[] = TOOLS.map((t) => ({
      id: `tool.${t.id}`,
      label: t.label,
      words: `araç ${t.hint}`,
      icon: t.id as IconName,
      keys: keys[`tool.${t.id}`],
      blocked:
        t.id === 'pin' ? (s) => (s.cut.mode === 'keys' ? null : 'yalnız Pimli kes') : undefined,
      run: () => set({ tool: t.id as Tool }),
    }));
    return [
      ...tools,
      {
        id: 'mode.socket',
        label: 'Tapa',
        words: 'kesim modu socket yuva',
        icon: 'socket',
        run: () => setMode('socket'),
      },
      {
        id: 'mode.keys',
        label: 'Pimli kes',
        words: 'kesim modu keys pim',
        icon: 'keys',
        run: () => setMode('keys'),
      },
      {
        id: 'mode.fast',
        label: 'Yapıştır',
        words: 'kesim modu fast düz',
        icon: 'fast',
        run: () => setMode('fast'),
      },
      {
        id: 'cut',
        label: 'Kes',
        words: 'kesimi uygula',
        icon: 'fast',
        blocked: noPaint,
        run: () => runCut(),
      },
      {
        id: 'preview',
        label: 'Önizleme',
        words: 'önizle',
        keys: keys.preview,
        blocked: noPaint,
        run: () => togglePreview(),
      },
      {
        id: 'suggest',
        label: 'Çıkıntıları öner',
        words: 'göz burun kaş',
        icon: 'suggest',
        blocked: noParts,
        run: autoSuggestFeatures,
      },
      { id: 'slot.add', label: 'Seçim seti ekle', words: '+ renk slot set yeni', run: addSlot },
      {
        id: 'slot.clear',
        label: 'Seçimi temizle',
        words: 'boyayı sil',
        icon: 'erase',
        keys: keys['slot.clear'],
        blocked: noPaint,
        run: clearActiveSlot,
      },
      {
        id: 'split',
        label: 'Kopukları ayır',
        words: 'mesh',
        icon: 'split',
        blocked: noSelection,
        run: () => splitSelected(),
      },
      {
        id: 'repair',
        label: 'Onar',
        words: 'mesh delikleri kapat voxel',
        icon: 'repair',
        blocked: noSelection,
        run: () => voxelRepairSelected(),
      },
      {
        id: 'refine',
        label: 'İncelt',
        words: 'mesh üçgenleri böl',
        icon: 'refine',
        blocked: noSelection,
        run: () => refineSelected(),
      },
      {
        id: 'simplify',
        label: 'Sadeleştir',
        words: 'mesh üçgen azalt büyük model decimate',
        icon: 'refine',
        blocked: noSelection,
        run: () => {
          const s = get();
          const part = s.parts.find((p) => p.id === s.selectedPartId);
          if (part)
            simplifyParts(
              [part.id],
              Math.min(SIMPLIFY_TARGET, Math.round(part.mesh.labels.length / 2)),
            );
        },
      },
      {
        id: 'explode',
        label: 'Aralıklı',
        words: 'düzen ayrık görünüm explode',
        icon: 'explode',
        keys: keys['view.explode'],
        blocked: noParts,
        run: toggleExplode,
      },
      {
        id: 'xray',
        label: 'Saydam',
        words: 'düzen xray',
        icon: 'xray',
        run: () => set((s) => ({ xray: !s.xray })),
      },
      {
        id: 'printSize',
        label: 'Baskı boyu',
        words: 'düzen ölçekle ölçek',
        icon: 'printSize',
        blocked: noParts,
        run: () => {
          const pop = document.querySelector<HTMLDetailsElement>('details.print-size-pop');
          if (pop) pop.open = true;
        },
      },
      {
        id: 'file.open',
        label: 'Aç',
        words: 'dosya stl obj 3mf yükle',
        icon: 'open',
        run: () => document.getElementById('open-model')?.click(),
      },
      {
        id: 'file.sample',
        label: 'Örnek modeli aç',
        words: 'dosya figür',
        icon: 'open',
        run: () => openSample(),
      },
      {
        id: 'file.previous',
        label: 'Önceki oturumu aç',
        words: 'dosya kurtar geri oturum kayıt',
        icon: 'open',
        // X106: ezilen çalışma; ekrandaki çalışma da yerine "önceki" olur
        run: () => restoreSession('previous').then(() => requestAnimationFrame(() => fitView())),
      },
      {
        id: 'file.save',
        label: 'Kaydet',
        words: 'dosya 3dsplit proje',
        blocked: noParts,
        run: saveProject,
      },
      {
        id: 'export.bambu',
        label: 'Dışa aktar: 3MF — Bambu Studio / OrcaSlicer',
        words: 'export',
        blocked: noParts,
        run: export3mf,
      },
      {
        id: 'export.generic',
        label: 'Dışa aktar: 3MF — genel',
        words: 'export',
        blocked: noParts,
        run: export3mfGeneric,
      },
      {
        id: 'export.stl',
        label: 'Dışa aktar: STL (ZIP)',
        words: 'export',
        blocked: noParts,
        run: exportStlZip,
      },
      {
        id: 'export.part',
        label: 'Dışa aktar: seçili parça STL',
        words: 'export',
        blocked: noSelection,
        run: () => {
          const id = get().selectedPartId;
          if (id) exportPartStl(id);
        },
      },
      {
        id: 'undo',
        label: 'Geri al',
        words: 'undo',
        keys: 'Ctrl+Z',
        blocked: (s) => (s.undoStack.length ? null : 'geri alınacak adım yok'),
        run: undo,
      },
      {
        id: 'redo',
        label: 'Yinele',
        words: 'redo ileri',
        keys: 'Ctrl+Shift+Z',
        blocked: (s) => (s.redoStack.length ? null : 'yinelenecek adım yok'),
        run: redo,
      },
      {
        id: 'view.fitAll',
        label: 'Hepsini sığdır',
        words: 'görünüş kamera',
        icon: 'fitAll',
        blocked: noParts,
        run: fitAll,
      },
      {
        id: 'view.fitSelected',
        label: 'Seçiliyi sığdır',
        words: 'görünüş kamera',
        icon: 'fitSelected',
        blocked: noSelection,
        run: () => {
          const id = get().selectedPartId;
          if (id) fitPart(id);
        },
      },
      {
        id: 'view.home',
        label: 'Ev görünüşü',
        words: 'görünüş kamera başlangıç',
        icon: 'home',
        keys: keys.fit,
        blocked: noParts,
        run: fitView,
      },
      ...(
        [
          ['Ön', [0, -1, 0.6]],
          ['Arka', [0, 1, 0.6]],
          ['Sağ', [1, 0, 0.6]],
          ['Sol', [-1, 0, 0.6]],
          ['Üst', [0, -0.2, 1]],
          ['Alt', [0, -0.2, -1]],
          ['Eğik', [1, -1, 0.9]],
        ] as [string, [number, number, number]][]
      ).map(
        ([name, dir]): Item => ({
          id: `view.${name}`,
          label: `Görünüş: ${name}`,
          words: 'kamera',
          icon: 'views',
          blocked: noParts,
          run: () => viewToward(...dir),
        }),
      ),
      {
        id: 'bed',
        label: 'Tabla',
        words: 'baskı tablası ızgara',
        icon: 'bed',
        run: () => setCameraPrefs({ ...get().camera, bed: !get().camera.bed }),
      },
      {
        id: 'help',
        label: 'Yardım',
        words: 'kısayollar',
        keys: keys.help,
        run: () => set({ helpOpen: true }),
      },
    ];
  }, [keys]);
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(id: string): void {
  try {
    const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // depolama kapalı: son kullanılanlar tutulmaz
  }
}

/** Sözcüklerin hepsi geçen komutlar; adın başında geçen önce. Boşken son kullanılanlar önde. */
function filter(items: Item[], query: string): Item[] {
  const q = foldTurkish(query.trim());
  if (!q) {
    const recent = loadRecent();
    const first = recent.flatMap((id) => items.filter((it) => it.id === id));
    return [...first, ...items.filter((it) => !recent.includes(it.id))];
  }
  const words = q.split(/\s+/);
  const scored: { it: Item; score: number }[] = [];
  for (const it of items) {
    const name = foldTurkish(it.label);
    const hay = `${name} ${foldTurkish(it.words ?? '')}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    scored.push({ it, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.it);
}

/** X90: Ctrl/Cmd+K ile açılan komut arama. ↑ ↓ seçer, Enter çalıştırır, Esc kapatır. */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const items = useItems();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => (open ? filter(items, query) : []), [open, items, query]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  if (!open) return null;
  const state = get();
  const close = () => set({ paletteOpen: false });
  const run = (it: Item | undefined) => {
    if (!it || it.blocked?.(get())) return;
    close();
    saveRecent(it.id);
    it.run();
  };
  return (
    <div className="palette-backdrop" onPointerDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-label="Komut ara"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          className="palette-input"
          placeholder="Komut ara…"
          aria-label="Komut ara"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(shown.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(shown[index]);
            }
          }}
        />
        <ul className="palette-list" ref={list} aria-label="Komutlar">
          {shown.length === 0 && <li className="empty">Komut bulunamadı</li>}
          {shown.map((it, i) => {
            const why = it.blocked?.(state) ?? null;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-disabled={!!why}
                  aria-current={i === index}
                  className={`${i === index ? 'active' : ''}${why ? ' blocked' : ''}`}
                  onPointerMove={() => setIndex(i)}
                  onClick={() => run(it)}
                >
                  <span className="pi">{it.icon && <Icon name={it.icon} size={16} />}</span>
                  <span className="pl">{it.label}</span>
                  {why && <span className="why">{why}</span>}
                  {it.keys && <kbd>{it.keys}</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
