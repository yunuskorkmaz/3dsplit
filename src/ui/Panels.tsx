import { useRef } from 'react';
import type { CutMode, PinShape } from '../core/cut';
import { ACCEPTED_EXTENSIONS } from '../io/importFile';
import {
  addSlot,
  deletePart,
  export3mf,
  export3mfGeneric,
  exportPartStl,
  exportStlZip,
  importFiles,
  redo,
  refineSelected,
  renamePart,
  runCut,
  activeIslands,
  saveProject,
  setSocketDirection,
  selectPart,
  splitSelected,
  togglePreview,
  toggleVisible,
  undo,
  updateSlot,
} from '../state/actions';
import { type CutSettings, dismiss, set, useStore } from '../state/store';
import { NumberField } from './fields';
import { cameraDirection } from './ViewportHost';

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
        <button type="button" onClick={export3mf} title="Bambu Studio / OrcaSlicer projesi: renk başına filament, parçalar plakada dizili">
          3MF
        </button>
        <button type="button" onClick={export3mfGeneric} title="Her slicer'da açılan düz çok nesneli 3MF (filament ataması yok)">
          3MF (genel)
        </button>
        <button type="button" onClick={exportStlZip}>
          STL (ZIP)
        </button>
      </div>
      <div className="row">
        <button type="button" onClick={saveProject} title="Boyama ve parçalarla birlikte kaydet (.3dsplit); İçe aktar ile açılır">
          Projeyi kaydet
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
  const pinCount = useStore((s) => s.pins.length);
  const directionGizmo = useStore((s) => s.directionGizmo);
  const suggestion = useStore((s) => s.suggestion);
  useStore((s) => s.paintVersion);
  const islands = cut.mode === 'socket' ? activeIslands() : [];
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
      {suggestion && (
        <div className={`suggestion ${suggestion.mode === cut.mode ? 'ok' : ''}`}>
          {suggestion.mode === cut.mode ? '✓ ' : 'Öneri: '}
          <b>{suggestion.mode === 'keys' ? 'Keys' : 'Socket'}</b> — {suggestion.reason}
          {suggestion.mode !== cut.mode && (
            <button type="button" onClick={() => update({ mode: suggestion.mode })}>
              Uygula
            </button>
          )}
        </div>
      )}
      {cut.mode === 'socket' && (
        <>
          <NumberField label="Derinlik" value={cut.depth} min={0.4} max={30} step={0.1} unit="mm" onChange={(v) => update({ depth: v })} />
          {islands.length > 1 && (
            <label className="field">
              <input type="checkbox" checked={cut.linkAll} onChange={(e) => update({ linkAll: e.target.checked })} />
              <span>Link all ({islands.length} bölge aynı ayarla)</span>
            </label>
          )}
          {islands.length > 1 &&
            !cut.linkAll &&
            islands.map((isl, i) => (
              <NumberField
                key={isl.key}
                label={`Bölge ${i + 1}`}
                value={cut.islandDepths[isl.key] ?? cut.depth}
                min={0.4}
                max={30}
                step={0.1}
                unit="mm"
                title={`~${isl.area.toFixed(0)} mm² — derinlik`}
                onChange={(v) => update({ islandDepths: { ...cut.islandDepths, [isl.key]: v } })}
              />
            ))}
          <div className="row">
            <span className="label">Yön: {cut.direction ? 'elle' : 'otomatik'}</span>
            <button type="button" className={directionGizmo ? 'active' : ''} onClick={() => set({ directionGizmo: !directionGizmo })} title="Ok üzerindeki gizmo ile döndür">
              Döndür
            </button>
            <button type="button" onClick={() => setSocketDirection(cameraDirection())} title="Tapa yönü = şu anki bakış yönü">
              Kameradan
            </button>
            <button type="button" disabled={!cut.direction} onClick={() => setSocketDirection(null)}>
              Oto
            </button>
          </div>
          <NumberField
            label="Squeeze"
            value={Math.round(cut.squeeze * 100)}
            min={0}
            max={90}
            step={5}
            unit="%"
            onChange={(v) => update({ squeeze: v / 100 })}
          />
        </>
      )}
      {cut.mode !== 'fast' && (
        <NumberField
          label="Duvar"
          value={cut.minWall}
          min={0}
          max={5}
          step={0.1}
          unit="mm"
          title="Önizlemede yuva çevresinde bundan ince kalan duvar kırmızı gösterilir (0: kontrol yok)"
          onChange={(v) => update({ minWall: v })}
        />
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
              <option value="snap">Snap (yapıştırıcısız)</option>
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
            <button type="button" disabled={!pinCount} onClick={() => set({ pins: [], selectedPin: -1, preview: null })}>
              Temizle ({pinCount})
            </button>
          </div>
          <p className="hint">Bölgeye tıkla: pim ekle. Pime tıklayıp sürükle: taşı. Shift+tık: sil. Pim yoksa kesim yüzeyinin ortasına bir tane konur.</p>
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
