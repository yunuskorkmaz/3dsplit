import {
  autoSmartScale,
  gapFillSelected,
  mirrorOffset,
  removePin,
  updatePin,
  setSmartAngle,
  setSmartOptions,
  smoothActiveRegion,
} from '../state/actions';
import { useKeymap } from '../state/keymap';
import { set, type Tool, useStore } from '../state/store';
import { NumberField, Toggle } from './fields';

export const TOOLS: { id: Tool; icon: string; label: string; key: string; hint: string }[] = [
  { id: 'smart', icon: '✦', label: 'Smart Fill', key: 'F', hint: 'Tıkla: çıkıntıyı seç. Shift+tık: sil.' },
  { id: 'brush', icon: '●', label: 'Fırça', key: 'B', hint: 'Sürükle: boya. Shift: sil.' },
  { id: 'erase', icon: '◌', label: 'Silgi', key: 'E', hint: 'Sürükle: seçimi sil. Shift: boya.' },
  { id: 'smooth', icon: '≈', label: 'Yumuşat', key: 'S', hint: 'Sınırın üstünde gezdir: girinti/çıkıntıyı düzeltir.' },
  { id: 'bucket', icon: '▣', label: 'Kova', key: 'G', hint: 'Tıkla: aynı renkli bölgeyi doldur.' },
  { id: 'pin', icon: '⊕', label: 'Pim', key: 'P', hint: 'Tıkla: pim ekle/seç. Sürükle: taşı. Gizmo: ekseni döndür. Shift+tık: sil.' },
];

/** Viewport'un solundaki dikey araç çubuğu. */
export function ToolBar({ onFit }: { onFit: () => void }) {
  const tool = useStore((s) => s.tool);
  const keys = useKeymap((s) => s.map);
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'active' : ''}
          onClick={() => set({ tool: t.id })}
          title={`${t.label} (${keys[`tool.${t.id}`]}) — ${t.hint}`}
        >
          <span className="icon">{t.icon}</span>
          <span className="key">{keys[`tool.${t.id}`]}</span>
        </button>
      ))}
      <button type="button" className="fit" onClick={onFit} title={`Görünümü sığdır (${keys.fit} veya boşluğa çift tık) — model kaybolursa geri getirir`}>
        <span className="icon">⤢</span>
        <span className="key">{keys.fit}</span>
      </button>
    </div>
  );
}

/** Viewport'un üstünde, seçili aracın ayarları. */
export function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const brushRadius = useStore((s) => s.brushRadius);
  const smartAngle = useStore((s) => s.smartAngle);
  const smartScale = useStore((s) => s.smartScale);
  useStore((s) => s.smartAutoScale);
  const smartConcave = useStore((s) => s.smartConcave);
  const smartValley = useStore((s) => s.smartValley);
  const smoothStrength = useStore((s) => s.smoothStrength);
  const smoothExact = useStore((s) => s.smoothExact);
  const gapArea = useStore((s) => s.gapArea);
  const pin = useStore((s) => s.pins[s.selectedPin]);
  const selectedPin = useStore((s) => s.selectedPin);
  const cut = useStore((s) => s.cut);
  const mirror = useStore((s) => s.mirror);
  const xray = useStore((s) => s.xray);
  useStore((s) => s.parts);
  const paintTool = tool === 'smart' || tool === 'brush' || tool === 'erase' || tool === 'smooth' || tool === 'bucket';
  const slot = useStore((s) => s.slots.find((x) => x.id === s.activeSlot));
  useStore((s) => s.selectedPartId);
  const info = TOOLS.find((t) => t.id === tool);
  const radius = (
    <NumberField
      label="Yarıçap"
      value={brushRadius}
      min={0.2}
      max={50}
      step={0.1}
      unit="mm"
      log
      title="Alt+tekerlek veya [ ] ile de değişir"
      onChange={(v) => set({ brushRadius: v })}
    />
  );
  return (
    <div className="tool-options">
      <span className="tool-name">
        {info?.label}
        {slot && (
          <span className="slot-chip" style={{ background: slot.color }}>
            {slot.name}
          </span>
        )}
      </span>
      {tool === 'smart' && (
        <>
          <NumberField label="Açı" value={smartAngle} min={1} max={90} step={1} unit="°" title="Shift+sağ sürükle ile de değişir" onChange={setSmartAngle} />
          <NumberField
            label={smartScale > 0 ? 'Ölçek' : 'Ölçek (oto)'}
            value={smartScale > 0 ? smartScale : autoSmartScale()}
            min={0.1}
            max={10}
            step={0.05}
            unit="mm"
            log
            title="Otomatikte tıklanan özelliğe göre seçilir; elle değiştirirsen sabitlenir"
            onChange={(v) => setSmartOptions({ smartScale: v })}
          />
          {smartScale > 0 && (
            <button type="button" onClick={() => setSmartOptions({ smartScale: 0 })}>
              Oto
            </button>
          )}
          <Toggle
            label="Çukurda dur"
            checked={smartConcave}
            title="Sadece çukur kıvrımlarda dur; tümseklerden geç (göz, burun, kaş)"
            onChange={(v) => setSmartOptions({ smartConcave: v })}
          />
          <Toggle
            label="Vadiye oturt"
            checked={smartValley}
            title="Seçimi çıkıntının dibindeki çukur çizgiye oturt"
            onChange={(v) => setSmartOptions({ smartValley: v })}
          />
        </>
      )}
      {(tool === 'brush' || tool === 'erase') && (
        <>
          {radius}
          <Toggle
            label="X-ray"
            checked={xray}
            title="Model yarı saydam; fırça küre içindeki arka ve gizli yüzleri de boyar"
            onChange={(v) => set({ xray: v })}
          />
        </>
      )}
      {tool === 'smooth' && (
        <>
          {radius}
          <NumberField
            label="Güç"
            value={Math.round(smoothStrength * 100)}
            min={5}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => set({ smoothStrength: v / 100 })}
          />
          <button type="button" onClick={smoothActiveRegion} title="Aktif slotun tüm sınırını tek seferde düzgün bir eğriye oturtur; alanı korur">
            Tüm sınırı yumuşat
          </button>
          <Toggle
            label="Üçgenleri böl"
            checked={smoothExact}
            title="Sınır üçgen kenarlarına bağlı kalmaz, eğri boyunca üçgenler bölünür: kaba mesh'te de düzgün kesim kenarı. Şekil değişmez, üçgen sayısı biraz artar"
            onChange={(v) => set({ smoothExact: v })}
          />
        </>
      )}
      {tool === 'bucket' && (
        <>
          <NumberField label="Boşluk" value={gapArea} min={0.1} max={200} step={0.1} unit="mm²" log onChange={(v) => set({ gapArea: v })} />
          <button type="button" onClick={gapFillSelected} title="Bu alandan küçük renk adalarını komşu renge çevir">
            Gap Fill
          </button>
        </>
      )}
      {tool === 'pin' && cut.mode !== 'keys' && <span className="tool-hint">Pimler Keys kesiminde kullanılır; sağ panelde Keys'i seç.</span>}
      {tool === 'pin' && cut.mode === 'keys' && pin && (
        <>
          <span className="tool-name">Pim {selectedPin + 1}</span>
          <NumberField
            label="Yarıçap"
            value={pin.radius ?? cut.pinRadius}
            min={0.5}
            max={20}
            step={0.1}
            unit="mm"
            log
            onChange={(v) => updatePin(selectedPin, { radius: v })}
          />
          <NumberField
            label="Boy"
            value={pin.length ?? cut.pinLength}
            min={1}
            max={60}
            step={0.5}
            unit="mm"
            log
            onChange={(v) => updatePin(selectedPin, { length: v })}
          />
          <button type="button" disabled={!pin.axis} onClick={() => updatePin(selectedPin, { axis: undefined })} title="Ekseni kesim yüzeyine dik yap">
            Ekseni sıfırla
          </button>
          <button type="button" onClick={() => removePin(selectedPin)}>
            Pimi sil
          </button>
        </>
      )}
      {paintTool && (
        <span className="mirror-group">
          <Toggle
            label="Ayna"
            checked={mirror.enabled}
            title="Boyama karşı tarafa da uygulanır (göz, kulak gibi çift özellikler)"
            onChange={(v) => set((s) => ({ mirror: { ...s.mirror, enabled: v } }))}
          />
          {mirror.enabled && (
            <>
              {(['X', 'Y', 'Z'] as const).map((name, axis) => (
                <button
                  key={name}
                  type="button"
                  className={mirror.axis === axis ? 'active' : ''}
                  onClick={() => set((s) => ({ mirror: { ...s.mirror, axis: axis as 0 | 1 | 2, offset: null } }))}
                >
                  {name}
                </button>
              ))}
              <NumberField
                label="Konum"
                value={mirrorOffset()}
                min={-10000}
                max={10000}
                step={0.1}
                unit="mm"
                title="Ayna düzleminin konumu; varsayılan parçanın ortası"
                onChange={(v) => set((s) => ({ mirror: { ...s.mirror, offset: v } }))}
              />
              {mirror.offset !== null && (
                <button type="button" onClick={() => set((s) => ({ mirror: { ...s.mirror, offset: null } }))}>
                  Ortala
                </button>
              )}
            </>
          )}
        </span>
      )}
      <span className="tool-hint">{info?.hint}</span>
    </div>
  );
}
