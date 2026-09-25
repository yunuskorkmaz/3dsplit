import { useEffect } from 'react';
import { importFiles, redo, togglePreview, undo } from '../state/actions';
import { get, set } from '../state/store';
import { CutPanel, FilePanel, PartsPanel, SlotPanel, StatusBar, ToolPanel } from './Panels';
import { ViewportHost } from './ViewportHost';

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
      if (e.code === 'Space') {
        e.preventDefault();
        togglePreview();
      } else if (e.key === 'b' || e.key === 'B') set({ tool: 'brush' });
      else if (e.key === 'f' || e.key === 'F') set({ tool: 'smart' });
      else if (e.key === 'g' || e.key === 'G') set({ tool: 'bucket' });
      else if (e.key === '[') set({ brushRadius: Math.max(0.2, get().brushRadius / 1.2) });
      else if (e.key === ']') set({ brushRadius: Math.min(50, get().brushRadius * 1.2) });
      else if (/^[0-9]$/.test(e.key)) {
        const id = Number(e.key);
        if (get().slots.some((s) => s.id === id)) set({ activeSlot: id, preview: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useShortcuts();
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
      </aside>
      <main>
        <ViewportHost />
        <StatusBar />
      </main>
      <aside className="right">
        <ToolPanel />
        <SlotPanel />
        <CutPanel />
      </aside>
    </div>
  );
}
