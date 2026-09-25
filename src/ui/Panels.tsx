import { useRef } from 'react';
import type { CutMode, PinShape } from '../core/cut';
import { ACCEPTED_EXTENSIONS } from '../io/importFile';
import {
  addSlot,
  deletePart,
  export3mf,
  exportPartStl,
  exportStlZip,
  gapFillSelected,
  importFiles,
  redo,
  refineSelected,
  renamePart,
  runCut,
  selectPart,
  setSmartAngle,
  setSmartOptions,
  autoSmartScale,
  splitSelected,
  togglePreview,
  toggleVisible,
  undo,
  updateSlot,
} from '../state/actions';
import { type CutSettings, dismiss, set, type Tool, useStore } from '../state/store';

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <input
        type="number"
        className="num"
        min={props.min}
        max={props.max}
        step={props.step}
        value={Number(props.value.toFixed(3))}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.unit && <span className="unit">{props.unit}</span>}
    </label>
  );
}

export function FilePanel() {
  const input = useRef<HTMLInputElement>(null);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  return (
    <section>
      <h3>Dosya</h3>
      <div className="row">
        <button type="button" onClick={() => input.current?.click()}>
          İçe aktar
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
        <button type="button" onClick={export3mf}>
          3MF
        </button>
        <button type="button" onClick={exportStlZip}>
          STL (ZIP)
        </button>
      </div>
      <div className="row">
        <button type="button" disabled={!canUndo} onClick={undo} title="Ctrl+Z">
          Geri al
        </button>
        <button type="button" disabled={!canRedo} onClick={redo} title="Ctrl+Shift+Z">
          Yinele
        </button>
      </div>
    </section>
  );
}

export function PartsPanel() {
  const parts = useStore((s) => s.parts);
  const selected = useStore((s) => s.selectedPartId);
  const refineEdge = useStore((s) => s.refineEdge);
  return (
    <section className="grow">
      <h3>Parçalar</h3>
      {parts.length === 0 && <p className="hint">STL, OBJ veya 3MF dosyasını sürükleyip bırakın.</p>}
      <ul className="parts">
        {parts.map((p) => (
          <li key={p.id} className={p.id === selected ? 'selected' : ''} onClick={() => selectPart(p.id)}>
            <input type="checkbox" checked={p.visible} onChange={() => toggleVisible(p.id)} onClick={(e) => e.stopPropagation()} />
            <input className="name" value={p.name} onChange={(e) => renamePart(p.id, e.target.value)} />
            {p.badge === 'source' && <span className="badge source">kaynak</span>}
            {p.badge === 'new' && <span className="badge new">yeni</span>}
            {!p.manifold && <span className="badge bad" title="Kapalı mesh değil">!</span>}
            <span className="tris">{(p.mesh.labels.length / 1000).toFixed(1)}k</span>
            <button type="button" title="STL indir" onClick={(e) => (e.stopPropagation(), exportPartStl(p.id))}>
              ↓
            </button>
            <button type="button" title="Sil" onClick={(e) => (e.stopPropagation(), deletePart(p.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={splitSelected} title="Kopuk parçaları ayrı nesnelere böl">
          Split
        </button>
      </div>
      <NumberField label="Kenar" value={refineEdge} min={0.1} max={5} step={0.05} unit="mm" onChange={(v) => set({ refineEdge: v })} />
      <button type="button" onClick={refineSelected} title="Seçili parçayı küçük üçgenlere böler; ince sınırlar için">
        İncelt
      </button>
      <p className="hint">Sınır tırtıklıysa önce inceltin; etiketler korunur.</p>
    </section>
  );
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'smart', label: 'Smart Fill', key: 'F' },
  { id: 'brush', label: 'Fırça', key: 'B' },
  { id: 'bucket', label: 'Kova', key: 'G' },
];

export function ToolPanel() {
  const tool = useStore((s) => s.tool);
  const brushRadius = useStore((s) => s.brushRadius);
  const smartAngle = useStore((s) => s.smartAngle);
  const smartScale = useStore((s) => s.smartScale);
  const smartConcave = useStore((s) => s.smartConcave);
  useStore((s) => s.selectedPartId);
  const auto = autoSmartScale();
  const gapArea = useStore((s) => s.gapArea);
  return (
    <section>
      <h3>Boyama</h3>
      <div className="row">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={tool === t.id ? 'active' : ''} onClick={() => set({ tool: t.id })} title={t.key}>
            {t.label}
          </button>
        ))}
      </div>
      {tool === 'smart' && (
        <>
          <NumberField label="Açı eşiği" value={smartAngle} min={1} max={90} step={1} unit="°" onChange={setSmartAngle} />
          <NumberField
            label={smartScale > 0 ? 'Ölçek' : 'Ölçek (oto)'}
            value={smartScale > 0 ? smartScale : auto}
            min={0.1}
            max={10}
            step={0.1}
            unit="mm"
            onChange={(v) => setSmartOptions({ smartScale: v })}
          />
          <div className="row">
            <label className="field">
              <input type="checkbox" checked={smartConcave} onChange={(e) => setSmartOptions({ smartConcave: e.target.checked })} />
              <span>Sadece çukur kenarda dur</span>
            </label>
            {smartScale > 0 && (
              <button type="button" onClick={() => setSmartOptions({ smartScale: 0 })}>
                Oto ölçek
              </button>
            )}
          </div>
          <p className="hint">Yayılıyorsa: açıyı düşür veya ölçeği büyüt. Çukur modu göz, burun gibi çıkıntılar içindir.</p>
        </>
      )}
      {tool === 'brush' && (
        <NumberField label="Yarıçap" value={brushRadius} min={0.2} max={50} step={0.1} unit="mm" onChange={(v) => set({ brushRadius: v })} />
      )}
      <p className="hint">Shift: sil · Shift+sağ sürükle: eşik · Alt+sol: döndür · [ ]: fırça boyu</p>
      <div className="row">
        <NumberField label="Gap alanı" value={gapArea} min={0.1} max={200} step={0.1} unit="mm²" onChange={(v) => set({ gapArea: v })} />
      </div>
      <button type="button" onClick={gapFillSelected}>
        Gap Fill
      </button>
    </section>
  );
}

export function SlotPanel() {
  const slots = useStore((s) => s.slots);
  const active = useStore((s) => s.activeSlot);
  return (
    <section>
      <h3>Slotlar</h3>
      <ul className="slots">
        {slots.map((s) => (
          <li key={s.id} className={s.id === active ? 'selected' : ''} onClick={() => set({ activeSlot: s.id })}>
            <input type="color" value={s.color} onChange={(e) => updateSlot(s.id, { color: e.target.value })} onClick={(e) => e.stopPropagation()} />
            <input className="name" value={s.name} onChange={(e) => updateSlot(s.id, { name: e.target.value })} />
            <span className="key">{s.id <= 9 ? s.id : ''}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={addSlot}>
        + Slot
      </button>
    </section>
  );
}

const MODES: { id: CutMode; label: string; hint: string }[] = [
  { id: 'fast', label: 'Fast', hint: 'Düz kapakla keser; yapıştırmalık.' },
  { id: 'socket', label: 'Socket', hint: 'Bölge içeri doğru tapa olur, gövdede yuva açılır. İnce, yüzeysel bölgeler için.' },
  { id: 'keys', label: 'Keys', hint: 'Düz kesim + pim/yuva. Kalın bölgeler (kol, kafa) için.' },
];

export function CutPanel() {
  const cut = useStore((s) => s.cut);
  const tool = useStore((s) => s.tool);
  const pinCount = useStore((s) => s.pinPoints.length);
  const previewOn = useStore((s) => s.preview !== null);
  const activeSlot = useStore((s) => s.activeSlot);
  const slotName = useStore((s) => s.slots.find((x) => x.id === s.activeSlot)?.name);
  const update = (patch: Partial<CutSettings>) => set((s) => ({ cut: { ...s.cut, ...patch }, preview: null }));
  return (
    <section>
      <h3>Kesim — {activeSlot === 0 ? 'slot seçin' : slotName}</h3>
      <div className="row">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={cut.mode === m.id ? 'active' : ''} onClick={() => update({ mode: m.id })} title={m.hint}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{MODES.find((m) => m.id === cut.mode)?.hint}</p>
      {cut.mode === 'socket' && (
        <NumberField label="Derinlik" value={cut.depth} min={0.4} max={30} step={0.1} unit="mm" onChange={(v) => update({ depth: v })} />
      )}
      {cut.mode !== 'fast' && (
        <NumberField label="Clearance" value={cut.clearance} min={0} max={1} step={0.05} unit="mm" onChange={(v) => update({ clearance: v })} />
      )}
      {cut.mode === 'keys' && (
        <>
          <label className="field">
            <span>Pim şekli</span>
            <select value={cut.pinShape} onChange={(e) => update({ pinShape: e.target.value as PinShape })}>
              <option value="cylinder">Silindir</option>
              <option value="octagon">Sekizgen</option>
              <option value="cube">Küp</option>
            </select>
          </label>
          <NumberField label="Pim yarıçapı" value={cut.pinRadius} min={0.5} max={20} step={0.1} unit="mm" onChange={(v) => update({ pinRadius: v })} />
          <NumberField label="Pim boyu" value={cut.pinLength} min={1} max={60} step={0.5} unit="mm" onChange={(v) => update({ pinLength: v })} />
          <label className="field">
            <input type="checkbox" checked={cut.pinOnPart} onChange={(e) => update({ pinOnPart: e.target.checked })} />
            <span>Pim kesilen parçada</span>
          </label>
          <div className="row">
            <button type="button" className={tool === 'pin' ? 'active' : ''} onClick={() => set({ tool: tool === 'pin' ? 'smart' : 'pin' })}>
              Pim yerleştir
            </button>
            <button type="button" disabled={!pinCount} onClick={() => set({ pinPoints: [], preview: null })}>
              Temizle ({pinCount})
            </button>
          </div>
          <p className="hint">Pim yoksa kesim yüzeyinin ortasına bir tane konur.</p>
        </>
      )}
      <div className="row">
        <button type="button" className={previewOn ? 'active' : ''} onClick={togglePreview} title="Space">
          Önizleme
        </button>
        <button type="button" className="primary" onClick={runCut}>
          Kes
        </button>
      </div>
    </section>
  );
}

export function StatusBar() {
  const busy = useStore((s) => s.busy);
  const messages = useStore((s) => s.messages);
  return (
    <div className="status">
      {busy && <div className="msg busy">{busy}</div>}
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.kind}`} onClick={() => dismiss(m.id)}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
