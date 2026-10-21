import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { longestExtent, PRINT_SIZE_MAX, PRINT_SIZE_MIN, sizeWarning } from '../core/geometry';
import {
  addSlot,
  clearActiveSlot,
  clearSlotPaint,
  deletePart,
  modelExtent,
  removeSlot,
  renamePart,
  selectPart,
  showAllParts,
  soloPart,
  toggleVisible,
  updateSlot,
} from '../state/actions';
import { useKeymap } from '../state/keymap';
import { get, type Part, set, useStore } from '../state/store';
import { NumberField } from './fields';
import { Panel } from './Panel';
import { fitPart } from './ViewportHost';

const STORAGE_KEY = '3dsplit.tree';

function loadFolders(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Açık/kapalı durumu tarayıcıda hatırlanan klasör. Kapalıyken içerik DOM'da kalır, görünmez. */
function useFolder(id: string, defaultOpen: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => loadFolders()[id] ?? defaultOpen);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadFolders(), [id]: !open }));
    } catch {
      // depolama kapalı: yalnız bu oturum
    }
  };
  return [open, toggle];
}

function Folder(props: {
  id: string;
  title: string;
  count?: number;
  defaultOpen: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const [open, toggle] = useFolder(props.id, props.defaultOpen);
  return (
    <div className={`tree-folder${open ? ' open' : ''}`}>
      <div className="folder-head">
        <button
          type="button"
          className="folder-toggle"
          aria-expanded={open}
          onClick={toggle}
          title={open ? 'Kapat' : 'Aç'}
        >
          <span className="caret">{open ? '▾' : '▸'}</span>
          {props.title}
          {props.count !== undefined && <span className="count">{props.count}</span>}
        </button>
        {props.extra}
      </div>
      <div className="folder-body" hidden={!open}>
        {props.children}
      </div>
    </div>
  );
}

type MenuItem = { label: string; onClick: () => void; disabled?: boolean };
type MenuState = { x: number; y: number; items: MenuItem[] } | null;

/** Sağ tık menüsü: dışarı tıklayınca ya da Esc ile kapanır. */
function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.target instanceof Element && e.target.closest('.context-menu')) return;
      onClose();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  // yüzen panelin backdrop-filter'ı fixed konumu panele bağlar: menü body'de çizilir
  return createPortal(
    <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      {menu.items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function partSizeTitle(size: number): string {
  const w = sizeWarning(size);
  if (w === 'large') return `En uzun kenar. ${PRINT_SIZE_MAX} mm'den büyük: tablaya sığmayabilir`;
  if (w === 'small') return `En uzun kenar. ${PRINT_SIZE_MIN} mm'den küçük: pim ve tapa sığmaz`;
  return 'En uzun kenar';
}

function formatMm(v: number): string {
  return `${v.toLocaleString('tr-TR', { maximumFractionDigits: v < 10 ? 1 : 0 })} mm`;
}

/** Parça başına boyalı renklerin üçgen sayısı (taban ve kaynaklar hariç). */
function usePaintCounts(parts: Part[]): Map<string, Map<number, number>> {
  // boya yerinde değişir; sürüm değişince yeniden sayılır
  const paintVersion = useStore((s) => s.paintVersion);
  return useMemo(() => {
    void paintVersion;
    const all = new Map<string, Map<number, number>>();
    for (const p of parts) {
      if (p.badge === 'source') continue;
      const n = new Map<number, number>();
      const labels = p.mesh.labels;
      for (let i = 0; i < labels.length; i++) {
        const id = labels[i] ?? 0;
        if (id) n.set(id, (n.get(id) ?? 0) + 1);
      }
      all.set(p.id, n);
    }
    return all;
  }, [parts, paintVersion]);
}

function PartRow(props: {
  part: Part;
  size: number;
  colors?: Map<number, number>;
  openMenu: (e: React.MouseEvent, p: Part) => void;
}) {
  const { part: p, colors } = props;
  const selected = useStore((s) => s.selectedPartId === p.id);
  const activeSlot = useStore((s) => s.activeSlot);
  const slots = useStore((s) => s.slots);
  const keys = useKeymap((s) => s.map);
  const [expanded, setExpanded] = useState(true);
  const painted = slots.filter((s) => (colors?.get(s.id) ?? 0) > 0);
  return (
    <li
      className={`${selected ? 'selected' : ''}${p.visible ? '' : ' hidden-part'}${
        p.badge !== 'source' && sizeWarning(props.size) ? ' size-warn' : ''
      }`}
      onClick={() => selectPart(p.id)}
      onContextMenu={(e) => props.openMenu(e, p)}
    >
      <div className="part-main">
        <button
          type="button"
          className="twisty"
          disabled={!painted.length}
          aria-label={expanded ? 'Renkleri gizle' : 'Renkleri göster'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {painted.length ? (expanded ? '▾' : '▸') : ''}
        </button>
        <button
          type="button"
          className="eye"
          title={`Gizle/göster (${keys['part.hide']}) · Alt+tık: yalnız bunu göster (${keys['part.solo']})`}
          onClick={(e) => {
            e.stopPropagation();
            if (e.altKey) soloPart(p.id);
            else toggleVisible(p.id);
          }}
        >
          {p.visible ? '👁' : '–'}
        </button>
        <input
          className="name"
          value={p.name}
          title={`${p.name} · ${p.mesh.labels.length.toLocaleString('tr-TR')} üçgen`}
          onChange={(e) => renamePart(p.id, e.target.value)}
        />
        <span className="size" title={partSizeTitle(props.size)}>
          {formatMm(props.size)}
        </span>
        {p.badge === 'source' && (
          <span
            className="badge source"
            title="Kesimden önceki hali; gizli tutulur, dışa aktarılmaz"
          >
            kaynak
          </span>
        )}
        {p.badge === 'new' && (
          <span className="badge new" title="Kesimle oluşan parça">
            yeni
          </span>
        )}
        {!p.manifold && (
          <span className="badge bad" title="Kapalı değil. Şeritte Mesh › Onar">
            bozuk
          </span>
        )}
        <button
          type="button"
          className="more"
          title="Parça menüsü (sağ tık)"
          aria-label={`${p.name} menüsü`}
          onClick={(e) => {
            e.stopPropagation();
            props.openMenu(e, p);
          }}
        >
          ⋯
        </button>
      </div>
      {expanded && painted.length > 0 && (
        <div className="part-colors">
          {painted.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`color-row${selected && activeSlot === s.id ? ' active' : ''}`}
              title={`${p.name} parçasında ${s.name}: ${(colors?.get(s.id) ?? 0).toLocaleString('tr-TR')} üçgen`}
              onClick={(e) => {
                e.stopPropagation();
                selectPart(p.id);
                set({ activeSlot: s.id });
              }}
            >
              <span className="swatch" style={{ background: s.color }} />
              <span className="cname">{s.name}</span>
              <span className="tris">{(colors?.get(s.id) ?? 0).toLocaleString('tr-TR')}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function SlotRows({ openMenu }: { openMenu: (e: React.MouseEvent, id: number) => void }) {
  const slots = useStore((s) => s.slots);
  const active = useStore((s) => s.activeSlot);
  const hiddenSlots = useStore((s) => s.hiddenSlots);
  return (
    <ul className="slots">
      {slots.map((s) => {
        const hidden = hiddenSlots.includes(s.id);
        return (
          <li
            key={s.id}
            className={`${s.id === active ? 'selected' : ''}${hidden ? ' hidden-slot' : ''}`}
            onClick={() => set({ activeSlot: s.id })}
            onContextMenu={(e) => openMenu(e, s.id)}
          >
            <input
              type="color"
              value={s.color}
              onChange={(e) => updateSlot(s.id, { color: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              className="name"
              value={s.name}
              onChange={(e) => updateSlot(s.id, { name: e.target.value })}
            />
            <span className="key" title={s.id <= 9 ? `Kısayol: ${s.id}` : undefined}>
              {s.id <= 9 ? s.id : ''}
            </span>
            {s.id !== 0 && (
              <>
                <button
                  type="button"
                  className="eye"
                  title={hidden ? 'Boyayı göster' : 'Boyayı gizle (yalnız görüntü)'}
                  onClick={(e) => {
                    e.stopPropagation();
                    set((st) => ({
                      hiddenSlots: hidden
                        ? st.hiddenSlots.filter((x) => x !== s.id)
                        : [...st.hiddenSlots, s.id],
                    }));
                  }}
                >
                  {hidden ? '–' : '👁'}
                </button>
                <button
                  type="button"
                  className="more"
                  title="Renk menüsü (sağ tık): temizle, kaldır"
                  aria-label={`${s.name} menüsü`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(e, s.id);
                  }}
                >
                  ⋯
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * X85: soldaki Model ağacı. Gövdeler (her birinin altında boyalı renkleri), Renkler ve
 * Kaynaklar (kesimden önceki gizli parçalar) klasörleri; sağ tık menüsü.
 */
export function ModelPanel() {
  const parts = useStore((s) => s.parts);
  const explode = useStore((s) => s.explode);
  const dimOthers = useStore((s) => s.dimOthers);
  const keys = useKeymap((s) => s.map);
  const [menu, setMenu] = useState<MenuState>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const bodies = parts.filter((p) => p.badge !== 'source');
  const sources = parts.filter((p) => p.badge === 'source');
  const sizes = useMemo(() => new Map(parts.map((p) => [p.id, longestExtent([p.mesh])])), [parts]);
  const extent = useMemo(() => modelExtent(parts), [parts]);
  const warning = parts.length ? sizeWarning(extent) : null;
  const counts = usePaintCounts(parts);
  const hidden = parts.filter(
    (p) => !p.visible && (p.badge !== 'source' || parts.every((q) => q.badge === 'source')),
  ).length;

  const at = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return { x: e.clientX, y: e.clientY };
  };
  const partMenu = (e: React.MouseEvent, p: Part) => {
    selectPart(p.id);
    setMenu({
      ...at(e),
      items: [
        { label: p.visible ? 'Gizle' : 'Göster', onClick: () => toggleVisible(p.id) },
        { label: 'Yalnız bunu göster', onClick: () => soloPart(p.id) },
        { label: 'Sığdır', onClick: () => fitPart(p.id) },
        { label: 'Sil', onClick: () => deletePart(p.id) },
      ],
    });
  };
  const slotMenu = (e: React.MouseEvent, id: number) => {
    set({ activeSlot: id });
    const painted = (counts.get(get().selectedPartId ?? '')?.get(id) ?? 0) > 0;
    setMenu({
      ...at(e),
      items: [
        { label: 'Seçili parçada temizle', disabled: !painted, onClick: () => clearSlotPaint(id) },
        { label: 'Rengi kaldır', disabled: id === 0, onClick: () => removeSlot(id) },
      ],
    });
  };

  return (
    <Panel
      id="model"
      grow
      title="Model"
      extra={bodies.length > 0 && <span className="panel-count">{bodies.length} gövde</span>}
    >
      {parts.length === 0 && (
        <p className="hint">STL, OBJ veya 3MF dosyasını sürükleyip bırakın ya da üstte "Aç".</p>
      )}
      {parts.length > 0 && (
        <div className="tree">
          <Folder
            id="bodies"
            title="Gövdeler"
            count={bodies.length}
            defaultOpen
            extra={
              parts.length > 1 && (
                <button
                  type="button"
                  className="folder-action"
                  disabled={!hidden}
                  onClick={showAllParts}
                  title={`Kaynaklar hariç hepsini göster (${keys['part.showAll']})`}
                >
                  Tümünü göster
                </button>
              )
            }
          >
            <ul className="parts">
              {bodies.map((p) => (
                <PartRow
                  key={p.id}
                  part={p}
                  size={sizes.get(p.id) ?? 0}
                  colors={counts.get(p.id)}
                  openMenu={partMenu}
                />
              ))}
            </ul>
            {warning && (
              <div className="print-size warn">
                <p>
                  {parts.length > 1 ? 'En büyük parça' : 'Model'} {formatMm(extent)}:{' '}
                  {warning === 'large'
                    ? `${PRINT_SIZE_MAX} mm'den büyük, birimi inç ya da metre olabilir.`
                    : `${PRINT_SIZE_MIN} mm'den küçük; pim ve tolerans bu boyda anlamsız.`}{' '}
                  Şeritte Düzen › Baskı boyu ile düzeltin.
                </p>
              </div>
            )}
            {explode > 0 && (
              <NumberField
                label="Ayrıklık"
                value={explode}
                min={0.05}
                max={3}
                step={0.05}
                unit="×"
                title="Parçaların merkezden uzaklaşma oranı (sadece görüntü)"
                onChange={(v) => set({ explode: v })}
              />
            )}
          </Folder>
          <Folder id="slots" title="Renkler" defaultOpen>
            <SlotRows openMenu={slotMenu} />
            <div className="row">
              <button type="button" onClick={addSlot}>
                + Renk
              </button>
              <button
                type="button"
                onClick={clearActiveSlot}
                title={`Seçili parçada aktif rengin tüm boyasını siler (${keys['slot.clear']}). Tek bir yeri silmek için: Akıllı seç'te Shift+tık, Silgi (E) veya Ctrl/Cmd+Z`}
              >
                Seçimi temizle
              </button>
            </div>
            <label className="field" title="Seçili renk dışındaki boyaları soldurur">
              <input
                type="checkbox"
                checked={dimOthers}
                onChange={(e) => set({ dimOthers: e.target.checked })}
              />
              <span>Seçili rengi öne çıkar</span>
            </label>
          </Folder>
          {sources.length > 0 && (
            <Folder id="sources" title="Kaynaklar" count={sources.length} defaultOpen={false}>
              <p className="hint">Kesimden önceki haller. Gizli tutulur, çıktıya girmez.</p>
              <ul className="parts sources">
                {sources.map((p) => (
                  <PartRow key={p.id} part={p} size={sizes.get(p.id) ?? 0} openMenu={partMenu} />
                ))}
              </ul>
            </Folder>
          )}
        </div>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </Panel>
  );
}
