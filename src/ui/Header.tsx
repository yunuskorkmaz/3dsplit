import { useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS } from '../io/importFile';
import {
  export3mf,
  export3mfGeneric,
  exportPartStl,
  exportStlZip,
  importFiles,
  redo,
  saveProject,
  undo,
} from '../state/actions';
import { hiddenBodies, uncutColors } from '../state/exportReport';
import { useKeymap } from '../state/keymap';
import { get, set, useStore } from '../state/store';
import { FilamentList } from './FilamentList';
import { StepBar } from './StepBar';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** Menüden bir öğe seçilince açılır listeyi kapatır. */
function closeMenu(e: React.MouseEvent) {
  (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
}

/**
 * X110: menü açıkken dışa aktarmada ne kaybolacağı. Kesilmemiş renk satırına tıklamak
 * gövdeyi ve ilk kesilmemiş seti seçer. Dışa aktarmayı engellemez.
 */
function ExportNotes() {
  const parts = useStore((s) => s.parts);
  const slots = useStore((s) => s.slots);
  const uncut = uncutColors(parts, slots);
  const hidden = hiddenBodies(parts);
  if (!uncut.length && !hidden) return null;
  const name = (id: number) => slots.find((s) => s.id === id)?.name ?? `Set ${id}`;
  return (
    <div className="export-notes">
      {uncut.map((u) => (
        <button
          key={u.partId}
          type="button"
          className="export-note"
          onClick={(e) => {
            closeMenu(e);
            set({ selectedPartId: u.partId, activeSlot: u.slots[0] });
          }}
          title="Gövdeyi ve ilk kesilmemiş seti seç"
        >
          {u.partName}: kesilmemiş {u.slots.length} renk ({u.slots.map(name).join(', ')}); dosyada
          gövde tek renk olur.
        </button>
      ))}
      {hidden > 0 && <div className="export-note">{hidden} gizli gövde dosyaya girmez.</div>}
    </div>
  );
}

/** X110: son Bambu 3MF'in filament eşlemesi. */
function LastExport() {
  const last = useStore((s) => s.lastExport);
  if (!last) return null;
  return (
    <div className="last-export">
      <small>Son dışa aktarma</small>
      <FilamentList filaments={last} />
    </div>
  );
}

/** X95: oturumun tarayıcıya en son ne zaman yazıldığı. */
function SessionStatus() {
  const { saving, savedAt } = useStore((s) => s.session);
  if (!saving && !savedAt) return null;
  return (
    <span
      className="session-status"
      title="Oturum tarayıcıda kendiliğinden saklanır; sayfa yenilenince kaldığın yerden devam edilir"
    >
      {saving
        ? 'Kaydediliyor…'
        : `Kaydedildi ${new Date(savedAt ?? 0).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
    </span>
  );
}

/** X29: üst çubuk — dosya, geri al/yinele, görünüm, yardım. */
export function Header() {
  const input = useRef<HTMLInputElement>(null);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const hasParts = useStore((s) => s.parts.length > 0);
  const keys = useKeymap((s) => s.map);
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <header className="topbar">
      <span className="brand">3dsplit</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        title="STL, OBJ, 3MF veya .3dsplit (sürükleyip bırakmak da olur)"
      >
        Aç
      </button>
      <input
        id="open-model"
        ref={input}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={!hasParts}
        onClick={saveProject}
        title="Boyama ve parçalarla birlikte kaydet (.3dsplit)"
      >
        Kaydet
      </button>
      <details
        className="menu"
        onToggle={(e) => setExportOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        {/* X119: model yokken gerçekten kapalı (klavye de açamaz) */}
        <summary
          className={hasParts ? '' : 'disabled'}
          aria-disabled={!hasParts}
          tabIndex={hasParts ? undefined : -1}
        >
          Dışa aktar ▾
        </summary>
        <div className="menu-list">
          {exportOpen && <ExportNotes />}
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              export3mf();
            }}
          >
            3MF — Bambu Studio / OrcaSlicer
            <small>Renk başına filament, parçalar plakada dizili</small>
          </button>
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              export3mfGeneric();
            }}
          >
            3MF — genel
            <small>Her slicer'da açılır, filament ataması yok</small>
          </button>
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              exportStlZip();
            }}
          >
            STL (ZIP)
            <small>Görünür parçalar, her biri ayrı STL</small>
          </button>
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              const id = get().selectedPartId;
              if (id) exportPartStl(id);
            }}
          >
            Seçili parça — STL
          </button>
          {exportOpen && <LastExport />}
        </div>
      </details>
      <span className="sep" />
      <button type="button" disabled={!canUndo} onClick={undo} title="Geri al (Ctrl/Cmd+Z)">
        Geri
      </button>
      <button type="button" disabled={!canRedo} onClick={redo} title="Yinele (Ctrl/Cmd+Shift+Z)">
        İleri
      </button>
      <span className="spacer" />
      <StepBar />
      <span className="spacer" />
      <SessionStatus />
      <button
        type="button"
        className="search-btn"
        onClick={() => set({ paletteOpen: true })}
        title="Bütün komutlar: araçlar, kesim, mesh, dosya, görünüşler"
      >
        <span>Komut ara</span>
        <kbd>{IS_MAC ? '⌘K' : 'Ctrl+K'}</kbd>
      </button>
      <button
        type="button"
        className="help-btn"
        onClick={() => set({ helpOpen: true })}
        title={`Yardım: iş akışı, araçlar, fare, kısayollar (${keys.help})`}
      >
        ? Yardım
      </button>
    </header>
  );
}
