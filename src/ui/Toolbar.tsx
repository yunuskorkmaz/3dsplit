import {
  autoSmartScale,
  gapFillSelected,
  setSmartAngle,
  setSmartOptions,
  smoothActiveRegion,
} from '../state/actions';
import { set, type Tool, useStore } from '../state/store';
import { NumberField, Toggle } from './fields';

export const TOOLS: { id: Tool; icon: string; label: string; key: string; hint: string }[] = [
  { id: 'smart', icon: '✦', label: 'Smart Fill', key: 'F', hint: 'Tıkla: çıkıntıyı seç. Shift+tık: sil.' },
  { id: 'brush', icon: '●', label: 'Fırça', key: 'B', hint: 'Sürükle: boya. Shift: sil.' },
  { id: 'erase', icon: '◌', label: 'Silgi', key: 'E', hint: 'Sürükle: seçimi sil. Shift: boya.' },
  { id: 'smooth', icon: '≈', label: 'Yumuşat', key: 'S', hint: 'Sınırın üstünde gezdir: girinti/çıkıntıyı düzeltir.' },
  { id: 'bucket', icon: '▣', label: 'Kova', key: 'G', hint: 'Tıkla: aynı renkli bölgeyi doldur.' },
  { id: 'pin', icon: '⊕', label: 'Pim', key: 'P', hint: 'Keys kesimi için pim yeri. Sürükle: taşı. Shift+tık: sil.' },
];

/** Viewport'un solundaki dikey araç çubuğu. */
export function ToolBar() {
  const tool = useStore((s) => s.tool);
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'active' : ''}
          onClick={() => set({ tool: t.id })}
          title={`${t.label} (${t.key}) — ${t.hint}`}
        >
          <span className="icon">{t.icon}</span>
          <span className="key">{t.key}</span>
        </button>
      ))}
    </div>
  );
}

/** Viewport'un üstünde, seçili aracın ayarları. */
export function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const brushRadius = useStore((s) => s.brushRadius);
  const smartAngle = useStore((s) => s.smartAngle);
  const smartScale = useStore((s) => s.smartScale);
  const smartConcave = useStore((s) => s.smartConcave);
  const smartValley = useStore((s) => s.smartValley);
  const smoothStrength = useStore((s) => s.smoothStrength);
  const gapArea = useStore((s) => s.gapArea);
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
            title="Büyük özelliklerde (kulak, kol) büyüt"
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
      {(tool === 'brush' || tool === 'erase') && radius}
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
      <span className="tool-hint">{info?.hint}</span>
    </div>
  );
}
