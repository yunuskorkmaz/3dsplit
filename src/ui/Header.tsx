import { useRef } from 'react';
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
import { useKeymap } from '../state/keymap';
import { get, set, useStore } from '../state/store';
import { StepBar } from './StepBar';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** Menüden bir öğe seçilince açılır listeyi kapatır. */
function closeMenu(e: React.MouseEvent) {
  (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
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
      <details className="menu">
        <summary className={hasParts ? '' : 'disabled'}>Dışa aktar ▾</summary>
        <div className="menu-list">
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
