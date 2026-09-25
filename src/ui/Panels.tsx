import { useState } from 'react';
import type { CutMode, PinShape } from '../core/cut';
import {
  activeIslands,
  addSlot,
  autoSuggestFeatures,
  deletePart,
  refineSelected,
  renamePart,
  runCut,
  selectPart,
  setSocketDirection,
  showAllParts,
  soloPart,
  splitSelected,
  togglePreview,
  toggleVisible,
  updateSlot,
  voxelRepairSelected,
} from '../state/actions';
import { useKeymap } from '../state/keymap';
import { type CutSettings, dismiss, set, setCameraPrefs, useStore } from '../state/store';
import { NumberField } from './fields';
import { Group, Panel } from './Panel';
import { RingEditor } from './RingEditor';
import { cameraDirection } from './ViewportHost';

export function CameraPanel() {
  const camera = useStore((s) => s.camera);
  return (
    <Panel id="camera" title="Kamera" defaultOpen={false}>
      <div className="row">
        <button
          type="button"
          className={camera.mode === 'default' ? 'active' : ''}
          onClick={() => setCameraPrefs({ ...camera, mode: 'default' })}
          title="Sağ sürükle döndür, orta / Ctrl+sağ kaydır"
        >
          Varsayılan
        </button>
        <button
          type="button"
          className={camera.mode === 'blender' ? 'active' : ''}
          onClick={() => setCameraPrefs({ ...camera, mode: 'blender' })}
          title="Orta sürükle döndür, Shift+orta kaydır, sağ kaydır"
        >
          Blender
        </button>
      </div>
      <label className="field">
        <input type="checkbox" checked={camera.invertZoom} onChange={(e) => setCameraPrefs({ ...camera, invertZoom: e.target.checked })} />
        <span>Ters yakınlaştırma</span>
      </label>
    </Panel>
  );
}

export function PartsPanel() {
  const parts = useStore((s) => s.parts);
  const selected = useStore((s) => s.selectedPartId);
  const explode = useStore((s) => s.explode);
  const keys = useKeymap((s) => s.map);
  // kaynak parçalar kesimden sonra bilerek gizli: sayılmaz
  const hidden = parts.filter((p) => !p.visible && (p.badge !== 'source' || parts.every((q) => q.badge === 'source'))).length;
  return (
    <Panel
      id="parts"
      grow
      title={`Parçalar${parts.length ? ` (${parts.length})` : ''}`}
      extra={
        parts.length > 1 && (
          <button type="button" disabled={!hidden} onClick={showAllParts} title={`Kaynaklar hariç hepsini göster (${keys['part.showAll']})`}>
            Tümünü göster
          </button>
        )
      }
    >
      {parts.length === 0 && <p className="hint">STL, OBJ veya 3MF dosyasını sürükleyip bırakın ya da üstte "Aç".</p>}
      <ul className="parts">
        {parts.map((p) => (
          <li key={p.id} className={`${p.id === selected ? 'selected' : ''}${p.visible ? '' : ' hidden-part'}`} onClick={() => selectPart(p.id)}>
            <button
              type="button"
              className="eye"
              title={`Gizle/göster (${keys['part.hide']}) · Alt+tık: yalnız bunu göster (${keys['part.solo']})`}
              onClick={(e) => {
                e.stopPropagation();
                if (e.altKey) soloPart(p.id);
                else toggleVisible(p.id);
              }}
            >
              {p.visible ? '👁' : '–'}
            </button>
            <input className="name" value={p.name} onChange={(e) => renamePart(p.id, e.target.value)} />
            {p.badge === 'source' && (
              <span className="badge source" title="Kesimden önceki hali; gizli tutulur, dışa aktarılmaz">
                kaynak
              </span>
            )}
            {p.badge === 'new' && <span className="badge new">yeni</span>}
            {!p.manifold && (
              <span className="badge bad" title="Kapalı mesh değil: Voxel onar'ı deneyin">
                !
              </span>
            )}
            <span className="tris">{(p.mesh.labels.length / 1000).toFixed(1)}k</span>
            <button type="button" className="icon-btn" title="Yalnız bunu göster / hepsini geri getir" onClick={(e) => (e.stopPropagation(), soloPart(p.id))}>
              ◎
            </button>
            <button type="button" className="icon-btn" title="Sil" onClick={(e) => (e.stopPropagation(), deletePart(p.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {explode > 0 && (
        <NumberField
          label="Ayrıklık"
          value={explode}
          min={0.05}
          max={3}
          step={0.05}
          unit="×"
          title="Parçaların merkezden uzaklaşma oranı (sadece görüntü)"
          onChange={(v) => set({ explode: v })}
        />
      )}
    </Panel>
  );
}

export function MeshToolsPanel() {
  const refineEdge = useStore((s) => s.refineEdge);
  return (
    <Panel id="meshTools" title="Mesh araçları" defaultOpen={false}>
      <div className="row">
        <button type="button" onClick={splitSelected} title="Kopuk parçaları ayrı nesnelere böl">
          Kopukları ayır
        </button>
        <button
          type="button"
          onClick={() => voxelRepairSelected()}
          title="Bozuk (! rozetli) parçayı voksel ızgarasıyla yeniden kurar: her zaman kapalı, ince ayrıntı biraz yumuşar"
        >
          Voxel onar
        </button>
      </div>
      <NumberField label="Kenar" value={refineEdge} min={0.1} max={5} step={0.05} unit="mm" onChange={(v) => set({ refineEdge: v })} />
      <button type="button" onClick={refineSelected} title="Seçili parçayı küçük üçgenlere böler; ince sınırlar için">
        İncelt
      </button>
      <p className="hint">Sınır tırtıklıysa önce inceltin; etiketler korunur.</p>
    </Panel>
  );
}

export function SlotPanel() {
  const slots = useStore((s) => s.slots);
  const active = useStore((s) => s.activeSlot);
  return (
    <Panel id="slots" title="Slotlar (renkler)">
      <ul className="slots">
        {slots.map((s) => (
          <li key={s.id} className={s.id === active ? 'selected' : ''} onClick={() => set({ activeSlot: s.id })}>
            <input type="color" value={s.color} onChange={(e) => updateSlot(s.id, { color: e.target.value })} onClick={(e) => e.stopPropagation()} />
            <input className="name" value={s.name} onChange={(e) => updateSlot(s.id, { name: e.target.value })} />
            <span className="key">{s.id <= 9 ? s.id : ''}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={addSlot}>
          + Slot
        </button>
        <button type="button" onClick={autoSuggestFeatures} title="Göz, burun, kaş, kulak gibi çıkıntıları bulup her birini yeni slota boyar (tek Ctrl+Z ile geri alınır)">
          Çıkıntıları öner
        </button>
      </div>
    </Panel>
  );
}

const TOLERANCE_PRESETS = [
  { label: 'Sıkı', value: 0.1, hint: 'Sıkı geçme; yapıştırıcı gerekmeyebilir, iyi kalibre yazıcı ister' },
  { label: 'Normal', value: 0.2, hint: 'FDM için güvenli varsayılan: elle takılır' },
  { label: 'Gevşek', value: 0.3, hint: 'Yazıcı fazla akıtıyorsa veya yapıştırılacaksa' },
];

/** Sağ panelin altına sabit: önizleme ve kesim düğmeleri. */
export function CutActions() {
  const previewOn = useStore((s) => s.preview !== null);
  const activeSlot = useStore((s) => s.activeSlot);
  const hasParts = useStore((s) => s.parts.length > 0);
  const keys = useKeymap((s) => s.map);
  const disabled = !hasParts || activeSlot === 0;
  return (
    <div className="cut-actions">
      <button type="button" disabled={disabled} className={previewOn ? 'active' : ''} onClick={togglePreview} title={`Kesimi uygulamadan göster (${keys.preview})`}>
        Önizleme
      </button>
      <button type="button" disabled={disabled} className="primary" onClick={runCut}>
        Kes
      </button>
    </div>
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
  const [ringOpen, setRingOpen] = useState(false);
  useStore((s) => s.paintVersion);
  const islands = cut.mode === 'socket' ? activeIslands() : [];
  const activeSlot = useStore((s) => s.activeSlot);
  const slotName = useStore((s) => s.slots.find((x) => x.id === s.activeSlot)?.name);
  const update = (patch: Partial<CutSettings>) => set((s) => ({ cut: { ...s.cut, ...patch }, preview: null }));
  return (
    <Panel id="cut" grow title={`Kesim — ${activeSlot === 0 ? 'slot seçin' : slotName}`}>
      <div className="row segmented">
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
        <Group title="Tapa">
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
            label="Ayak payı"
            value={cut.inset}
            min={0}
            max={10}
            step={0.1}
            unit="mm"
            title="0: tapa tam yüzeyle girer. Artırınca gövdeye giren ayak kenardan içeri çekilir; yuvanın çevresinde gövdede taşıyıcı basamak kalır"
            onChange={(v) => update({ inset: v })}
          />
          <div className="row">
            <button type="button" className={ringOpen ? 'active' : ''} onClick={() => setRingOpen(!ringOpen)} title="Tapa ayağının kesitini yönlere göre şekillendir (önizlemede 1 numara kırmızı)">
              Kesit şekli {cut.ringProfile.some((v) => v !== 0) ? '•' : ''}
            </button>
          </div>
          {ringOpen && <RingEditor value={cut.ringProfile} onChange={(v) => update({ ringProfile: v })} />}
          <NumberField
            label="Squeeze"
            value={Math.round(cut.squeeze * 100)}
            min={0}
            max={90}
            step={5}
            unit="%"
            onChange={(v) => update({ squeeze: v / 100 })}
          />
        </Group>
      )}
      {cut.mode !== 'socket' && (
        <label className="field" title="Sınır halkası yerine ona en uygun düzlemle kes: dümdüz kesim yüzeyi (kol, kulak)">
          <input type="checkbox" checked={cut.planar} onChange={(e) => update({ planar: e.target.checked })} />
          <span>Düzlemle kes</span>
        </label>
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
        <Group title="Tolerans">
          <NumberField
            label="Boşluk"
            value={cut.clearance}
            min={0}
            max={1}
            step={0.01}
            unit="mm"
            title="Tapa/pim ile yuva arasında her yüzeyde bırakılan boşluk. Yuva bu kadar büyütülür, parça boyutu değişmez"
            onChange={(v) => update({ clearance: Math.round(v * 100) / 100 })}
          />
          {cut.mode === 'keys' && (
            <NumberField
              label="Boy boşluğu"
              value={cut.pinDepthClearance}
              min={0}
              max={2}
              step={0.05}
              unit="mm"
              title="Delik pimden her uçta bu kadar derin: pim dibe oturmaz, iki parçanın kesim yüzleri birbirine tam değer"
              onChange={(v) => update({ pinDepthClearance: Math.round(v * 100) / 100 })}
            />
          )}
          <div className="row segmented">
            {TOLERANCE_PRESETS.map((t) => (
              <button key={t.label} type="button" className={Math.abs(cut.clearance - t.value) < 1e-6 ? 'active' : ''} onClick={() => update({ clearance: t.value })} title={t.hint}>
                {t.label} {t.value}
              </button>
            ))}
          </div>
          <p className="hint">
            {cut.mode === 'socket' ? 'Tapa ile yuva' : 'Pim ile delik'} arasındaki boşluk. FDM'de 0.2 elle takılır; sıkı geçme için 0.1, yazıcı fazla akıtıyorsa
            0.3. Reçinede 0.05–0.1.
          </p>
        </Group>
      )}
      {cut.mode === 'keys' && (
        <Group title="Pim">
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
        </Group>
      )}
    </Panel>
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
