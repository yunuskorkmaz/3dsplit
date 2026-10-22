import { useEffect } from 'react';
import {
  clearActiveSlot,
  discardSession,
  hideSelectedPart,
  importFiles,
  lineCancel,
  lineClose,
  lineUndo,
  openSample,
  redo,
  removePin,
  restoreSession,
  scheduleSuggestion,
  showAllParts,
  soloPart,
  startSessionAutosave,
  toggleExplode,
  togglePreview,
  undo,
} from '../state/actions';
import { type Command, commandFor, keyName, shortcutCapture } from '../state/keymap';
import { get, set, type Tool, useStore } from '../state/store';
import { cancelGeometry } from '../worker/client';
import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { HelpDialog } from './HelpDialog';
import { HistoryBar } from './HistoryPanel';
import { ModelPanel } from './ModelTree';
import { NavBar } from './NavBar';
import { CutActions, CutPanel, StatusBar } from './Panels';
import { ToolBar, ToolPanel, ViewCube } from './Toolbar';
import { ValueTags } from './ValueTags';
import { fitView, ViewportHost } from './ViewportHost';

function openModel(): void {
  document.getElementById('open-model')?.click();
}

function SessionOffer() {
  const offer = useStore((s) => s.session.offer);
  if (!offer) return null;
  const time = new Date(offer.savedAt).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <section className="session-offer" aria-label="Kaldığın yer">
      <p>
        Kaldığın yer: <b>{offer.name}</b> · {offer.bodies} gövde · {time}
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={async () => {
            await restoreSession();
            requestAnimationFrame(() => fitView());
          }}
        >
          Devam et
        </button>
        <button type="button" onClick={discardSession}>
          Yok say
        </button>
      </div>
    </section>
  );
}

function EmptyStage() {
  const parts = useStore((s) => s.parts);
  if (parts.length) return null;
  return (
    <div className="empty-stage">
      <SessionOffer />
      <p>Modeli aç, bölgeyi seç, kes, slicer'a aktar.</p>
      <div className="row">
        <button type="button" onClick={openModel}>
          Aç
        </button>
        <button
          type="button"
          onClick={openSample}
          title="Baş, burun, kollu basit figür; dosya gerekmez"
        >
          Örnek modeli aç
        </button>
      </div>
    </div>
  );
}

function runCommand(cmd: Command): void {
  if (cmd.startsWith('tool.')) set({ tool: cmd.slice(5) as Tool });
  else if (cmd === 'preview') togglePreview();
  else if (cmd === 'fit') fitView();
  else if (cmd === 'brush.smaller')
    set({ brushRadius: Math.round(Math.max(0.2, get().brushRadius / 1.2) * 100) / 100 });
  else if (cmd === 'part.hide') hideSelectedPart();
  else if (cmd === 'part.solo') {
    const id = get().selectedPartId;
    if (id) soloPart(id);
  } else if (cmd === 'part.showAll') showAllParts();
  else if (cmd === 'view.explode') toggleExplode();
  else if (cmd === 'help') set((s) => ({ helpOpen: !s.helpOpen }));
  else if (cmd === 'slot.clear') clearActiveSlot();
  else if (cmd === 'pin.move') set({ pinGizmo: 'translate' });
  else if (cmd === 'pin.rotate') set({ pinGizmo: 'rotate' });
  else if (cmd === 'brush.larger')
    set({ brushRadius: Math.round(Math.min(50, get().brushRadius * 1.2) * 100) / 100 });
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutCapture.active) return;
      if (e.key === 'Escape' && get().busy) {
        e.preventDefault();
        cancelGeometry();
        return;
      }
      if (e.key === 'Escape' && get().helpOpen) {
        set({ helpOpen: false });
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' &&
        (target as HTMLInputElement).type !== 'range' &&
        (target as HTMLInputElement).type !== 'checkbox'
      )
        return;
      if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      // X90: komut arama
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        set((s) => ({ paletteOpen: !s.paletteOpen }));
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod) return;
      // Alt: sadece harf/rakam olmayan karakterlerde (Türkçe Mac klavyesinde [ ] Option ile yazılır)
      if (e.altKey && (e.key.length !== 1 || /[\p{L}\p{N}]/u.test(e.key))) return;
      // X36: çizgi aracı tuşları
      if ((get().tool === 'line' || get().tool === 'seam') && get().line.anchors.length) {
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
      // X74: seçili pim Delete ile silinir (önizlemede her araçta)
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        get().selectedPin >= 0 &&
        get().pins.length &&
        (get().tool === 'pin' || get().previewActive)
      ) {
        e.preventDefault();
        removePin(get().selectedPin);
        return;
      }
      // pim aracında Esc: pim seçimini bırak
      if (
        (get().tool === 'pin' || get().previewActive) &&
        e.key === 'Escape' &&
        get().selectedPin >= 0
      ) {
        set({ selectedPin: -1 });
        return;
      }
      // X87: Esc gezinme kipini bitirir
      if (e.key === 'Escape' && get().navMode) {
        set({ navMode: null });
        return;
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
        if (get().slots.some((s) => s.id === id)) set({ activeSlot: id });
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
  useEffect(() => startSessionAutosave(), []);
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
      <ToolBar />
      <main className="stage">
        <ViewportHost />
        <EmptyStage />
        <ViewCube />
        <NavBar />
        <ValueTags />
        <div className="float side-left">
          <ModelPanel />
        </div>
        <div className="float side-right tool-window">
          <ToolPanel />
          <CutPanel />
          <CutActions />
        </div>
        <StatusBar />
      </main>
      <HistoryBar />
      <HelpDialog />
      <CommandPalette />
    </div>
  );
}
