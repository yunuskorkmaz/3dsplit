import { useRef } from 'react';
import { ACCEPTED_EXTENSIONS } from '../io/importFile';
import { export3mf, export3mfGeneric, exportPartStl, exportStlZip, importFiles, redo, saveProject, toggleExplode, undo } from '../state/actions';
import { useKeymap } from '../state/keymap';
import { get, set, useStore } from '../state/store';

/** Menüden bir öğe seçilince açılır listeyi kapatır. */
function closeMenu(e: React.MouseEvent) {
  (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
}

/** X29: üst çubuk — dosya, geri al/yinele, görünüm, yardım. */
export function Header() {
  const input = useRef<HTMLInputElement>(null);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const hasParts = useStore((s) => s.parts.length > 0);
  const explode = useStore((s) => s.explode);
  const xray = useStore((s) => s.xray);
  const keys = useKeymap((s) => s.map);
  return (
    <header className="topbar">
      <span className="brand">3dsplit</span>
      <button type="button" onClick={() => input.current?.click()} title="STL, OBJ, 3MF veya .3dsplit (sürükleyip bırakmak da olur)">
        Aç
      </button>
      <input
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
      <button type="button" disabled={!hasParts} onClick={saveProject} title="Boyama ve parçalarla birlikte kaydet (.3dsplit)">
        Kaydet
      </button>
      <details className="menu">
        <summary className={hasParts ? '' : 'disabled'}>Dışa aktar ▾</summary>
        <div className="menu-list">
          <button type="button" onClick={(e) => (closeMenu(e), export3mf())}>
            3MF — Bambu Studio / OrcaSlicer
            <small>Renk başına filament, parçalar plakada dizili</small>
          </button>
          <button type="button" onClick={(e) => (closeMenu(e), export3mfGeneric())}>
            3MF — genel
            <small>Her slicer'da açılır, filament ataması yok</small>
          </button>
          <button type="button" onClick={(e) => (closeMenu(e), exportStlZip())}>
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
        ↶
      </button>
      <button type="button" disabled={!canRedo} onClick={redo} title="Yinele (Ctrl/Cmd+Shift+Z)">
        ↷
      </button>
      <span className="sep" />
      <button type="button" className={explode > 0 ? 'active' : ''} onClick={toggleExplode} title={`Ayrık görünüm: parçaları birbirinden uzaklaştırır, sadece görüntü (${keys['view.explode']})`}>
        Ayrık
      </button>
      <button type="button" className={xray ? 'active' : ''} onClick={() => set({ xray: !xray })} title="X-ray: model yarı saydam, fırça arka yüzleri de boyar">
        X-ray
      </button>
      <span className="spacer" />
      <button type="button" className="help-btn" onClick={() => set({ helpOpen: true })} title={`Yardım: iş akışı, araçlar, fare, kısayollar (${keys.help})`}>
        ? Yardım
      </button>
    </header>
  );
}
