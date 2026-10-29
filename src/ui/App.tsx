import { useEffect } from 'react';
import {
  answerOpenAsk,
  clearActiveSlot,
  closeCoupon,
  discardSession,
  hideSelectedPart,
  importFiles,
  lineCancel,
  lineClose,
  lineUndo,
  openCoupon,
  openSample,
  redo,
  removePin,
  restoreSession,
  SIMPLIFY_TARGET,
  showAllParts,
  simplifyParts,
  soloPart,
  startSessionAutosave,
  startSuggestionWatch,
  toggleExplode,
  togglePreview,
  undo,
} from '../state/actions';
import { type Command, commandFor, keyName, shortcutCapture } from '../state/keymap';
import { get, notify, set, type Tool, useStore } from '../state/store';
import { cancelGeometry } from '../worker/client';
import { CommandPalette } from './CommandPalette';
import { CouponBar } from './CouponBar';
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
        <button
          type="button"
          onClick={discardSession}
          title="Kayıt silinmez; yeni model açınca Komut ara › Önceki oturumu aç ile geri gelir"
        >
          Yok say
        </button>
      </div>
    </section>
  );
}

/** X121: model açıkken yeni dosya açılınca ne yapılacağını sorar. */
function OpenAsk() {
  const ask = useStore((s) => s.openAsk);
  if (!ask) return null;
  const label = ask.files.length > 1 ? `${ask.files.length} dosya` : ask.files[0].name;
  return (
    <section className="notice-card" aria-label="Dosya açma">
      <p>
        <b>{label}</b> açılıyor.{' '}
        {ask.project
          ? 'Proje sahnenin yerine açılır; bugünkü çalışma "Önceki oturum" olarak saklanır.'
          : 'Yerine açarsan bugünkü çalışma "Önceki oturum" olarak saklanır.'}
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={() => answerOpenAsk('replace')}>
          Yerine aç
        </button>
        {!ask.project && (
          <button type="button" onClick={() => answerOpenAsk('add')}>
            Sahneye ekle
          </button>
        )}
        <button type="button" onClick={() => answerOpenAsk('cancel')}>
          Vazgeç
        </button>
      </div>
    </section>
  );
}

/** X96: çok büyük model açılınca sadeleştirme önerisi. */
function SimplifyOffer() {
  const offer = useStore((s) => s.simplifyOffer);
  if (!offer) return null;
  const fmt = (n: number) =>
    n >= 1e6
      ? `${(n / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} milyon`
      : `${Math.round(n / 1000)} bin`;
  return (
    <section className="notice-card" aria-label="Sadeleştirme önerisi">
      <p>
        Bu model <b>{fmt(offer.triangles)}</b> üçgen. {fmt(SIMPLIFY_TARGET)} üçgene sadeleştirmek
        seçimi, önizlemeyi ve kesimi birkaç kat hızlandırır; yüzey milimetrenin onda biri kadar
        oynar. Ctrl+Z ile geri alınır.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => simplifyParts(offer.partIds, SIMPLIFY_TARGET)}
        >
          Sadeleştir
        </button>
        <button type="button" onClick={() => set({ simplifyOffer: null })}>
          Olduğu gibi kalsın
        </button>
      </div>
    </section>
  );
}

function EmptyStage() {
  const parts = useStore((s) => s.parts);
  const coupon = useStore((s) => !!s.coupon);
  if (parts.length || coupon) return null;
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
      <button
        type="button"
        onClick={() => openCoupon()}
        title="Modelden önce bas: pim/tapa için hangi boşluğun oturduğunu gösterir"
      >
        Tolerans deneme parçası
      </button>
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
      // X115: deneme görünümünde araç kısayolu yok; Esc modele döner (komut arama açık)
      if (get().coupon) {
        if (e.key === 'Escape') closeCoupon();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        // X102: yarım çizgide geri al son noktayı siler, modeli değil
        const tool = get().tool;
        if (!e.shiftKey && (tool === 'line' || tool === 'seam') && get().line.anchors.length)
          return lineUndo();
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
      // X74, X122: önizlemede ve Pim aracında Delete yalnız seçili pimi siler, boyaya dokunmaz
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        (get().tool === 'pin' || get().previewActive)
      ) {
        e.preventDefault();
        if (get().selectedPin >= 0 && get().selectedPin < get().pins.length)
          removePin(get().selectedPin);
        else notify('info', 'Silinecek pim seçili değil. Pime tıkla, sonra Delete.');
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

export function App() {
  useShortcuts();
  const coupon = useStore((s) => !!s.coupon);
  useEffect(() => startSessionAutosave(), []);
  useEffect(() => startSuggestionWatch(), []);
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
      {/* X115: deneme görünümünde araçlar ve geçmiş kapalı */}
      <div className="contents" inert={coupon}>
        <ToolBar />
      </div>
      <main className="stage">
        <ViewportHost />
        <EmptyStage />
        <CouponBar />
        {!coupon && <SimplifyOffer />}
        <OpenAsk />
        <ViewCube />
        <NavBar />
        {!coupon && <ValueTags />}
        {!coupon && (
          <div className="float side-left">
            <ModelPanel />
          </div>
        )}
        {!coupon && (
          <div className="float side-right tool-window">
            <ToolPanel />
            <CutPanel />
            <CutActions />
          </div>
        )}
        <StatusBar />
      </main>
      <div className="contents" inert={coupon}>
        <HistoryBar />
      </div>
      <HelpDialog />
      <CommandPalette />
    </div>
  );
}
