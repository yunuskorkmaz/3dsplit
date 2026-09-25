import { useEffect } from 'react';
import { hideSelectedPart, importFiles, lineCancel, lineClose, lineUndo, redo, scheduleSuggestion, showAllParts, soloPart, toggleExplode, togglePreview, undo } from '../state/actions';
import { type Command, commandFor, keyName, shortcutCapture } from '../state/keymap';
import { get, set, type Tool, useStore } from '../state/store';
import { Header } from './Header';
import { HelpDialog } from './HelpDialog';
import { CameraPanel, CutActions, CutPanel, MeshToolsPanel, PartsPanel, SlotPanel, StatusBar } from './Panels';
import { ToolBar, ToolOptions } from './Toolbar';
import { fitView, ViewportHost } from './ViewportHost';

function runCommand(cmd: Command): void {
  if (cmd.startsWith('tool.')) set({ tool: cmd.slice(5) as Tool });
  else if (cmd === 'preview') togglePreview();
  else if (cmd === 'fit') fitView();
  else if (cmd === 'brush.smaller') set({ brushRadius: Math.round(Math.max(0.2, get().brushRadius / 1.2) * 100) / 100 });
  else if (cmd === 'part.hide') hideSelectedPart();
  else if (cmd === 'part.solo') {
    const id = get().selectedPartId;
    if (id) soloPart(id);
  } else if (cmd === 'part.showAll') showAllParts();
  else if (cmd === 'view.explode') toggleExplode();
  else if (cmd === 'help') set((s) => ({ helpOpen: !s.helpOpen }));
  else if (cmd === 'brush.larger') set({ brushRadius: Math.round(Math.min(50, get().brushRadius * 1.2) * 100) / 100 });
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutCapture.active) return;
      if (e.key === 'Escape' && get().helpOpen) {
        set({ helpOpen: false });
        return;
      }
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range' && (target as HTMLInputElement).type !== 'checkbox') return;
      if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod || e.altKey) return;
      // X36: çizgi aracı tuşları
      if (get().tool === 'line' && get().line.anchors.length) {
        if (e.key === 'Enter') {
          e.preventDefault();
          return lineClose();
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          return lineUndo();
        }
        if (e.key === 'Escape') return lineCancel();
      }
      // yardım açıkken sadece yardım kısayolu (kapatmak için) çalışır
      if (get().helpOpen && commandFor(keyName(e)) !== 'help') return;
      const cmd = commandFor(keyName(e));
      if (cmd) {
        e.preventDefault();
        runCommand(cmd);
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
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
      <Header />
      <aside className="left">
        <PartsPanel />
        <MeshToolsPanel />
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
        <CutActions />
      </aside>
      <HelpDialog />
    </div>
  );
}
