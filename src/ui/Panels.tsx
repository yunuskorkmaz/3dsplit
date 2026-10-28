import { useEffect, useMemo, useState } from 'react';
import type { CutMode, EdgeSmoothing, PinShape } from '../core/cut';
import {
  activeIslands,
  activePaintCount,
  clearActiveSlot,
  clearPins,
  isSlowPreview,
  makeToleranceCoupon,
  runCut,
  setSocketDirection,
  togglePreview,
} from '../state/actions';
import { useKeymap } from '../state/keymap';
import { type CutSettings, dismiss, get, set, useStore } from '../state/store';
import { cancelGeometry } from '../worker/client';
import { FilamentList } from './FilamentList';
import { NumberField } from './fields';
import { Group, Panel } from './Panel';
import { RingEditor } from './RingEditor';
import { cameraDirection } from './ViewportHost';

const PIN_SHAPES: { id: PinShape; label: string; hint: string }[] = [
  { id: 'cylinder', label: 'Silindir', hint: 'En yaygın; yapıştırılır ya da sıkı geçer' },
  { id: 'cube', label: 'Küp', hint: 'Dönmeyi engeller; tek pimde parça yerinde durur' },
  {
    id: 'octagon',
    label: 'Sekizgen',
    hint: 'Silindir gibi ama baskıda daha temiz, dönmeye biraz direnir',
  },
  { id: 'snap', label: 'Snap', hint: 'Yapıştırıcısız: esnek dilli tırnakla yerine oturur' },
];

const TOLERANCE_PRESETS = [
  {
    label: 'Sıkı',
    value: 0.1,
    hint: 'Sıkı geçme; yapıştırıcı gerekmeyebilir, iyi kalibre yazıcı ister',
  },
  { label: 'Normal', value: 0.2, hint: 'FDM için güvenli varsayılan: elle takılır' },
  { label: 'Gevşek', value: 0.3, hint: 'Yazıcı fazla akıtıyorsa veya yapıştırılacaksa' },
];

/** Sağ panelin altına sabit: önizleme ve kesim düğmeleri. */
/** X86: pencerenin altı: Önizleme kutusu (Space), İptal ve Kes. İptal boyayı silmez. */
export function CutActions() {
  const previewOn = useStore((s) => s.previewActive);
  const activeSlot = useStore((s) => s.activeSlot);
  const hasParts = useStore((s) => s.parts.length > 0);
  const tool = useStore((s) => s.tool);
  const keys = useKeymap((s) => s.map);
  const seamReady = useStore((s) => s.tool === 'seam' && !!s.line.closed && !s.line.bad);
  // X91: aktif rengin bu parçada boyası yoksa kesilecek bir şey yok
  const paintVersion = useStore((s) => s.paintVersion);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const painted = useMemo(() => {
    void [paintVersion, selectedPartId, activeSlot, hasParts];
    return activePaintCount() > 0;
  }, [paintVersion, selectedPartId, activeSlot, hasParts]);
  // X107: Dikiş'te boya kesilmez; Kes yalnız halka hazırsa açık
  const disabled = !hasParts || (tool === 'seam' ? !seamReady : !painted);
  // X103: mod öneriyi izliyorsa öneri gelene kadar Kes bekler
  const waiting = useStore((s) => s.suggesting && !s.cutModeManual && s.tool !== 'seam');
  return (
    <div className="cut-actions">
      <label className="field preview-toggle" title={`Kesimi uygulamadan göster (${keys.preview})`}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={previewOn}
          onChange={() => togglePreview()}
        />
        <span>Önizleme</span>
        <kbd>{keys.preview}</kbd>
      </label>
      <div className="row">
        <button
          type="button"
          disabled={!previewOn && tool === 'smart'}
          onClick={() => {
            if (get().previewActive) togglePreview();
            set({ tool: 'smart' });
          }}
          title="Önizlemeyi kapatır ve Akıllı seç'e döner; boya kalır"
        >
          İptal
        </button>
        <button
          type="button"
          disabled={disabled || waiting}
          className="primary"
          onClick={runCut}
          title={waiting ? 'Kesim modu belirleniyor; öneri gelince açılır' : undefined}
        >
          Kes
        </button>
      </div>
    </div>
  );
}

/** X86: kesilecek seçim: renk, parça, üçgen sayısı; × o boyayı siler (Ctrl+Z geri getirir). */
function SelectionRow() {
  const slot = useStore((s) => s.slots.find((x) => x.id === s.activeSlot));
  const part = useStore((s) => s.parts.find((p) => p.id === s.selectedPartId));
  const paintVersion = useStore((s) => s.paintVersion);
  const count = useMemo(() => {
    void paintVersion;
    if (!part || !slot || slot.id === 0) return 0;
    let n = 0;
    for (const l of part.mesh.labels) if (l === slot.id) n++;
    return n;
  }, [part, slot, paintVersion]);
  if (!part) return null;
  // X104: Taban aktifken kesilecek renk seçilmemiştir; boyamak değil renge tıklamak gerekir
  if (!slot || slot.id === 0)
    return (
      <div className="selection-row empty">
        Renk seçilmedi: ayıracağın renge tıkla ya da bir seçim seti seç.
      </div>
    );
  if (count === 0)
    return (
      <div className="selection-row empty">Seçim yok: önce bir bölge boyayın ({slot.name}).</div>
    );
  return (
    <div className="selection-row" title="Kesilecek bölge">
      <span className="swatch" style={{ background: slot.color }} />
      <span className="sel-text">
        <b>{slot.name}</b> · {part.name} · {count.toLocaleString('tr-TR')} üçgen
      </span>
      <button
        type="button"
        className="sel-clear"
        aria-label="Seçimi temizle"
        title="Bu boyayı siler (Ctrl+Z geri getirir)"
        onClick={clearActiveSlot}
      >
        ×
      </button>
    </div>
  );
}

const EDGE_LEVELS: { id: EdgeSmoothing; label: string; hint: string }[] = [
  { id: 'light', label: 'Hafif', hint: 'Sınır boyaya yakın kalır; yalnız üçgen basamakları gider' },
  { id: 'medium', label: 'Orta', hint: 'Varsayılan: küçük dalgalar düzelir' },
  {
    id: 'strong',
    label: 'Güçlü',
    hint: 'Sınır geniş bir eğriye oturur; kaba mesh ve fırça boyasında en pürüzsüz kesim',
  },
];

/** Seçicide her seferinde yeni dizi yeniden çizim döngüsü yapar. */
const NO_WARNINGS: string[] = [];

export function CutPanel() {
  const keys = useKeymap((s) => s.map);
  const hasParts = useStore((s) => s.parts.length > 0);
  const cut = useStore((s) => s.cut);
  const tool = useStore((s) => s.tool);
  const pinCount = useStore((s) => s.pins.length);
  const directionGizmo = useStore((s) => s.directionGizmo);
  const suggestion = useStore((s) => s.suggestion);
  const suggesting = useStore((s) => s.suggesting && !s.cutModeManual && s.tool !== 'seam');
  // X74: önizleme sessiz yenilenir; uyarıları (pin sığmadı gibi) burada görünür
  const previewOn = useStore((s) => s.previewActive);
  const previewWarnings = useStore((s) =>
    s.previewActive ? (s.preview?.warnings ?? NO_WARNINGS) : NO_WARNINGS,
  );
  // X78: önizlemesi uzun süren parçada canlı önizleme kapalı
  const slowPreview = useStore((s) => {
    const part = s.parts.find((p) => p.id === s.selectedPartId);
    return !!part && isSlowPreview(s.slowPreview, part.mesh, s.cut.mode);
  });
  const [ringOpen, setRingOpen] = useState(false);
  useStore((s) => s.paintVersion);
  // X107: Dikiş Tapa kullanmaz; panel Dikiş'in gerçekten yapacağı modu gösterir
  const mode: CutMode = tool === 'seam' ? (cut.mode === 'keys' ? 'keys' : 'fast') : cut.mode;
  const islands = mode === 'socket' ? activeIslands() : [];
  const activeSlot = useStore((s) => s.activeSlot);
  const slotName = useStore((s) => s.slots.find((x) => x.id === s.activeSlot)?.name);
  const update = (patch: Partial<CutSettings>) => set((s) => ({ cut: { ...s.cut, ...patch } }));
  const modeTitle = mode === 'socket' ? 'Tapa' : mode === 'keys' ? 'Pimli kes' : 'Yapıştır';
  const modeHint =
    tool === 'seam'
      ? mode === 'keys'
        ? 'Halkadan ikiye ayırır, kesite pim konur.'
        : 'Halkadan ikiye ayırır, parçalar yapıştırılır. Pim için Pimli kes’i seçin.'
      : mode === 'socket'
        ? 'Göz, kaş, burun. Tapa gövdeye girer, yerinde yuva kalır.'
        : mode === 'keys'
          ? 'Kol, bacak, kafa. Düz kesim ve pim.'
          : 'Yapıştırmalık kapak. Pim yok.';
  return (
    <Panel
      id="cut"
      grow
      disabled={!hasParts}
      title={`${modeTitle} — ${tool === 'seam' ? 'dikiş' : activeSlot === 0 ? 'renk seçin' : slotName}`}
    >
      <div id="kesim">
        {tool !== 'seam' && <SelectionRow />}
        <label
          className="field"
          title="Kesimden önce boyanın tırtıklı sınırını üçgenlerin içinden geçirir. Boyama değişmez; kapatınca kenar üçgen kenarında kalır"
        >
          <input
            type="checkbox"
            checked={cut.smoothEdge}
            onChange={(e) => update({ smoothEdge: e.target.checked })}
          />
          <span>Kenarı düzelt</span>
        </label>
        {cut.smoothEdge && (
          <fieldset className="row segmented edge-smoothing">
            <legend className="visually-hidden">Kenar düzeltme gücü</legend>
            {EDGE_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={(cut.edgeSmoothing ?? 'medium') === l.id ? 'active' : ''}
                onClick={() => update({ edgeSmoothing: l.id })}
                title={l.hint}
              >
                {l.label}
              </button>
            ))}
          </fieldset>
        )}
        {suggesting && !suggestion && hasParts && (
          <div className="suggestion-pending">Öneri hesaplanıyor…</div>
        )}
        {suggestion && tool !== 'seam' && (
          <div className={`suggestion ${suggestion.mode === mode ? 'ok' : ''}`}>
            {suggestion.mode === mode ? '✓ ' : 'Öneri: '}
            <b>{suggestion.mode === 'keys' ? 'Pimli kes' : 'Tapa'}</b> — {suggestion.reason}
            {suggestion.mode !== mode && (
              <button type="button" onClick={() => update({ mode: suggestion.mode })}>
                Uygula
              </button>
            )}
          </div>
        )}
        {previewWarnings.length > 0 && (
          <ul className="preview-warnings">
            {previewWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {slowPreview && !previewOn && tool !== 'seam' && (
          <p className="hint slow-preview">
            Bu model büyük: önizleme için {keys.preview}. Boyarken kendiliğinden açılmaz.
          </p>
        )}
        <p className="hint">{modeHint}</p>
        {tool === 'seam' && (
          <p className="hint">
            Dikiş halkası kapanınca Kes ayırır. Halka düzse kesim düzlemdir; değilse çizilen çizgiyi
            izler. Pimli kes seçiliyse kesite pim konur; değilse iki parça yapıştırmalık kalır.
          </p>
        )}
        {mode === 'socket' && (
          <Group title="Tapa">
            <NumberField
              label="Derinlik"
              value={cut.depth}
              min={0.4}
              max={30}
              step={0.1}
              unit="mm"
              onChange={(v) => update({ depth: v })}
            />
            {islands.length > 1 && (
              <label className="field">
                <input
                  type="checkbox"
                  checked={cut.linkAll}
                  onChange={(e) => update({ linkAll: e.target.checked })}
                />
                <span>Hepsine aynı ({islands.length} bölge)</span>
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
              <span className="label">Gidiş: {cut.direction ? 'elle' : 'otomatik'}</span>
              <button
                type="button"
                className={directionGizmo ? 'active' : ''}
                onClick={() => set({ directionGizmo: !directionGizmo })}
                title="Modelin üstündeki okla tapanın gideceği yönü çevir"
              >
                Çevir
              </button>
              <button
                type="button"
                onClick={() => setSocketDirection(cameraDirection())}
                title="Tapa, şu an baktığın yöne doğru girer"
              >
                Bakıştan
              </button>
              <button
                type="button"
                disabled={!cut.direction}
                onClick={() => setSocketDirection(null)}
                title="Yönü parçanın şeklinden kendisi seçer"
              >
                Otomatik
              </button>
            </div>
            <p className="hint">Tapa bu yönde gövdeye girer.</p>
          </Group>
        )}
        {mode === 'keys' && (
          <Group title="Pim">
            <div className="row segmented">
              {PIN_SHAPES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cut.pinShape === p.id ? 'active' : ''}
                  onClick={() => update({ pinShape: p.id })}
                  title={p.hint}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="pin-placement">
              <span>
                {pinCount
                  ? `${pinCount} pim elle yerleştirildi`
                  : 'Pimler otomatik: kesitin ortasına (uzun kesitte 2–3 pim)'}
              </span>
              <div className="row">
                <button
                  type="button"
                  className={tool === 'pin' ? 'active' : ''}
                  onClick={() => set({ tool: tool === 'pin' ? 'smart' : 'pin' })}
                  title="Pim aracını aç/kapa (P)"
                >
                  {tool === 'pin' ? 'Yerleştirmeyi bitir' : 'Elle yerleştir'}
                </button>
                {pinCount > 0 && (
                  <button type="button" onClick={clearPins}>
                    Otomatiğe dön
                  </button>
                )}
              </div>
              {tool !== 'pin' && previewOn && (
                <p className="hint">
                  Pimi tutup sürükle: taşı · Delete: seçili pimi sil · yeni pim için Elle yerleştir
                  (P).
                </p>
              )}
              {tool === 'pin' && (
                <p className="hint">
                  Bölgeye tıkla: pim ekle · pime tıklayıp sürükle: taşı · Shift+tık: sil. Seçili
                  pimin ayarları üst şeritte.
                </p>
              )}
            </div>
          </Group>
        )}
        {mode !== 'fast' && (
          <Group title="Tolerans">
            <div className="row segmented">
              {TOLERANCE_PRESETS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className={Math.abs(cut.clearance - t.value) < 1e-6 ? 'active' : ''}
                  onClick={() => update({ clearance: t.value })}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="hint">
              {mode === 'socket' ? 'Tapa ile yuva' : 'Pim ile delik'} arası {cut.clearance} mm. Emin
              değilsen önce deneme parçası bas.
            </p>
            <button
              type="button"
              onClick={makeToleranceCoupon}
              title="Seçili pim/tapa ile boşluğun −0.1, kendisi ve +0.1 mm'si için delikli küçük plaka ve pimler üretir; önce bunu basıp en iyi oturanı seçin"
            >
              Deneme parçası üret
            </button>
          </Group>
        )}
        {(tool === 'seam' || mode !== 'socket') && (
          <NumberField
            label="Yüz boşluğu"
            value={cut.faceGap}
            min={0}
            max={2}
            step={0.05}
            unit="mm"
            title="Düz kesilen yüzler arasında bırakılan boşluk. 0 ise yüzler birbirine değer. Pim boşluğundan ayrıdır. Eğri dikişte uygulanmaz."
            onChange={(v) => update({ faceGap: Math.round(v * 100) / 100 })}
          />
        )}
        <details className="advanced">
          <summary>İnce ayar</summary>
          {mode === 'socket' && (
            <>
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
                <button
                  type="button"
                  className={ringOpen ? 'active' : ''}
                  onClick={() => setRingOpen(!ringOpen)}
                  title="Tapa ayağının kesitini yönlere göre şekillendir (önizlemede 1 numara kırmızı)"
                >
                  Kesit şekli {cut.ringProfile.some((v) => v !== 0) ? '•' : ''}
                </button>
              </div>
              {ringOpen && (
                <RingEditor value={cut.ringProfile} onChange={(v) => update({ ringProfile: v })} />
              )}
              <NumberField
                label="Sıkıştır"
                value={Math.round(cut.squeeze * 100)}
                min={0}
                max={90}
                step={5}
                unit="%"
                onChange={(v) => update({ squeeze: v / 100 })}
              />
            </>
          )}
          {mode === 'keys' && (
            <>
              <label
                className="field"
                title="Yarıçap kesim halkasına uzaklığa ve kesit alanına göre, boy yarıçapın 4 katı. Uzun kesitte (pim aracıyla pim konmadıysa) uzun eksen boyunca 2–3 pim dizilir. Pim aracında tek tek boyut verilen pimler hariç"
              >
                <input
                  type="checkbox"
                  checked={cut.pinAuto}
                  onChange={(e) => update({ pinAuto: e.target.checked })}
                />
                <span>Pim boyutu otomatik</span>
              </label>
              {!cut.pinAuto && (
                <>
                  <NumberField
                    label="Yarıçap"
                    value={cut.pinRadius}
                    min={0.5}
                    max={20}
                    step={0.1}
                    unit="mm"
                    onChange={(v) => update({ pinRadius: v })}
                  />
                  <NumberField
                    label="Boy"
                    value={cut.pinLength}
                    min={1}
                    max={60}
                    step={0.5}
                    unit="mm"
                    onChange={(v) => update({ pinLength: v })}
                  />
                </>
              )}
              <NumberField
                label="Gövdede pay"
                value={Math.round(cut.pinBodyRatio * 100)}
                min={5}
                max={95}
                step={5}
                unit="%"
                title="Pim boyunun gövde tarafında kalan payı. %50: yarı yarıya; artırınca pim gövdeye daha derin girer. Pim aracında tek pim için ayrıca ayarlanır"
                onChange={(v) => update({ pinBodyRatio: v / 100 })}
              />
              {cut.pinShape !== 'snap' && (
                <NumberField
                  label="Uç pahı"
                  value={cut.pinChamfer}
                  min={0}
                  max={3}
                  step={0.1}
                  unit="mm"
                  title="Pim uçları konik: yuvaya kolay girer, baskıda uç sarkmaz. 0: düz uç"
                  onChange={(v) => update({ pinChamfer: v })}
                />
              )}
              <label
                className="field"
                title="Kapalıyken pim gövdede kalır, delik kesilen parçada açılır"
              >
                <input
                  type="checkbox"
                  checked={cut.pinOnPart}
                  onChange={(e) => update({ pinOnPart: e.target.checked })}
                />
                <span>Pim kesilen parçada</span>
              </label>
            </>
          )}
          {mode !== 'fast' && (
            <>
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
              {mode === 'keys' && (
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
            </>
          )}
          {mode !== 'socket' && (
            <label
              className="field"
              title="Sınır halkası yerine ona en uygun düzlemle kes: dümdüz kesim yüzeyi (kol, kulak)"
            >
              <input
                type="checkbox"
                checked={cut.planar}
                onChange={(e) => update({ planar: e.target.checked })}
              />
              <span>Düzlemle kes</span>
            </label>
          )}
        </details>
      </div>
    </Panel>
  );
}

/** X97: meşgul kartı: iş, aşama, geçen süre, İptal. */
function BusyCard() {
  const busy = useStore((s) => s.busy);
  const stage = useStore((s) => s.busyStage);
  const started = useStore((s) => s.busyStarted);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [busy]);
  if (!busy) return null;
  const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
  return (
    <div className="msg busy" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="busy-text">
        <b>{busy}</b>
        {stage && <span className="busy-stage">{stage}…</span>}
      </span>
      <span className="busy-time">{seconds} sn</span>
      <button
        type="button"
        onClick={() => cancelGeometry()}
        title="İşi durdur; model değişmez (Esc)"
      >
        İptal
      </button>
    </div>
  );
}

export function StatusBar() {
  const messages = useStore((s) => s.messages);
  return (
    <div className="status">
      <BusyCard />
      {messages.map((m) => (
        <div
          key={m.id}
          className={`msg ${m.kind}`}
          onClick={() => dismiss(m.id)}
          title={m.sticky ? 'Kapatmak için tıkla' : undefined}
        >
          {m.text}
          {m.filaments && <FilamentList filaments={m.filaments} />}
        </div>
      ))}
    </div>
  );
}
