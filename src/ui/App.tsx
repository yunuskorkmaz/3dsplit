import { useEffect } from 'react';
import { importFiles, redo, scheduleSuggestion, togglePreview, undo } from '../state/actions';
import { get, set, useStore } from '../state/store';
import { CameraPanel, CutPanel, FilePanel, PartsPanel, SlotPanel, StatusBar } from './Panels';
import { ToolBar, ToolOptions, TOOLS } from './Toolbar';
import { fitView, ViewportHost } from './ViewportHost';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod) return;
      if (e.key === 'Home') {
        e.preventDefault();
        fitView();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePreview();
      } else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (t) set({ tool: t.id });
      }
      if (e.key === '[') set({ brushRadius: Math.round(Math.max(0.2, get().brushRadius / 1.2) * 100) / 100 });
      else if (e.key === ']') set({ brushRadius: Math.round(Math.min(50, get().brushRadius * 1.2) * 100) / 100 });
      else if (/^[0-9]$/.test(e.key)) {
        const id = Number(e.key);
        if (get().slots.some((s) => s.id === id)) set({ activeSlot: id, preview: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Boyama, slot veya parça değişince kesim modu önerisini yenile. */
function useSuggestion() {
  const paintVersion = useStore((s) => s.paintVersion);
  const activeSlot = useStore((s) => s.activeSlot);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const parts = useStore((s) => s.parts);
  useEffect(() => {
    scheduleSuggestion();
  }, [paintVersion, activeSlot, selectedPartId, parts]);
}

export function App() {
  useShortcuts();
  useSuggestion();
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
      }}
    >
      <aside className="left">
        <FilePanel />
        <PartsPanel />
        <CameraPanel />
      </aside>
      <main>
        <ToolOptions />
        <div className="viewport-area">
          <ViewportHost />
          <ToolBar onFit={fitView} />
          <StatusBar />
        </div>
      </main>
      <aside className="right">
        <SlotPanel />
        <CutPanel />
      </aside>
    </div>
  );
}
