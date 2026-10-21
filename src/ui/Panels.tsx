import { useMemo, useState } from 'react';
import type { PinShape } from '../core/cut';
import { longestExtent, PRINT_SIZE_MAX, PRINT_SIZE_MIN, sizeWarning } from '../core/geometry';
import {
  activeIslands,
  addSlot,
  autoSuggestFeatures,
  clearActiveSlot,
  clearPins,
  clearSlotPaint,
  deletePart,
  isSlowPreview,
  makeToleranceCoupon,
  modelExtent,
  refineSelected,
  removeSlot,
  renamePart,
  runCut,
  scaleToPrintSize,
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
import { cancelGeometry } from '../worker/client';
import { NumberField } from './fields';
import { Group, Panel } from './Panel';
import { RingEditor } from './RingEditor';
import { cameraDirection, fitView } from './ViewportHost';

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
        <input
          type="checkbox"
          checked={camera.invertZoom}
          onChange={(e) => setCameraPrefs({ ...camera, invertZoom: e.target.checked })}
        />
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
  const [printSize, setPrintSize] = useState(100);
  // X71: parça başına ve model için en uzun kenar, mm
  const sizes = useMemo(() => new Map(parts.map((p) => [p.id, longestExtent([p.mesh])])), [parts]);
  const extent = useMemo(() => modelExtent(parts), [parts]);
  const warning = parts.length ? sizeWarning(extent) : null;
  // kaynak parçalar kesimden sonra bilerek gizli: sayılmaz
  const hidden = parts.filter(
    (p) => !p.visible && (p.badge !== 'source' || parts.every((q) => q.badge === 'source')),
  ).length;
  return (
    <Panel
      id="parts"
      grow
      title={`Parçalar${parts.length ? ` (${parts.length})` : ''}`}
      extra={
        parts.length > 1 && (
          <button
            type="button"
            disabled={!hidden}
            onClick={showAllParts}
            title={`Kaynaklar hariç hepsini göster (${keys['part.showAll']})`}
          >
            Tümünü göster
          </button>
        )
      }
    >
      {parts.length === 0 && (
        <p className="hint">STL, OBJ veya 3MF dosyasını sürükleyip bırakın ya da üstte "Aç".</p>
      )}
      <ul className="parts">
        {parts.map((p) => (
          <li
            key={p.id}
            className={`${p.id === selected ? 'selected' : ''}${p.visible ? '' : ' hidden-part'}${
              p.badge !== 'source' && sizeWarning(sizes.get(p.id) ?? 0) ? ' size-warn' : ''
            }`}
            onClick={() => selectPart(p.id)}
          >
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
            <input
              className="name"
              value={p.name}
              title={`${p.name} · ${p.mesh.labels.length.toLocaleString('tr-TR')} üçgen`}
              onChange={(e) => renamePart(p.id, e.target.value)}
            />
            <span className="size" title={partSizeTitle(sizes.get(p.id) ?? 0)}>
              {formatMm(sizes.get(p.id) ?? 0)}
            </span>
            {p.badge === 'source' && (
              <span
                className="badge source"
                title="Kesimden önceki hali; gizli tutulur, dışa aktarılmaz"
              >
                kaynak
              </span>
            )}
            {p.badge === 'new' && (
              <span className="badge new" title="Kesimle oluşan parça">
                yeni
              </span>
            )}
            {!p.manifold && (
              <span className="badge bad" title="Kapalı değil. Mesh araçlarından Delikleri kapat">
                bozuk
              </span>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Yalnız bunu göster. Tekrar basınca hepsi geri gelir"
              onClick={(e) => {
                e.stopPropagation();
                soloPart(p.id);
              }}
            >
              Tek
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Parçayı listeden sil"
              onClick={(e) => {
                e.stopPropagation();
                deletePart(p.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {parts.length > 0 && (
        <div className={`print-size${warning ? ' warn' : ''}`}>
          {warning && (
            <p>
              {parts.length > 1 ? 'En büyük parça' : 'Model'} {formatMm(extent)}:{' '}
              {warning === 'large'
                ? `${PRINT_SIZE_MAX} mm'den büyük, birimi inç ya da metre olabilir.`
                : `${PRINT_SIZE_MIN} mm'den küçük; pim ve tolerans bu boyda anlamsız.`}
            </p>
          )}
          <div className="row">
            <NumberField
              label="Baskı boyu"
              value={printSize}
              min={1}
              max={1000}
              step={1}
              unit="mm"
              title="En büyük parçanın en uzun kenarı bu boya gelir; bütün parçalar birlikte ölçeklenir. Ctrl+Z ile geri alınır"
              onChange={setPrintSize}
            />
            <button
              type="button"
              onClick={() => {
                scaleToPrintSize(printSize);
                requestAnimationFrame(() => fitView());
              }}
              title={`Şu an ${formatMm(extent)}`}
            >
              Ölçekle
            </button>
          </div>
        </div>
      )}
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

function partSizeTitle(size: number): string {
  const w = sizeWarning(size);
  if (w === 'large') return `En uzun kenar. ${PRINT_SIZE_MAX} mm'den büyük: tablaya sığmayabilir`;
  if (w === 'small') return `En uzun kenar. ${PRINT_SIZE_MIN} mm'den küçük: pim ve tapa sığmaz`;
  return 'En uzun kenar';
}

function formatMm(v: number): string {
  return `${v.toLocaleString('tr-TR', { maximumFractionDigits: v < 10 ? 1 : 0 })} mm`;
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
          title="Bozuk parçayı yeniden kurar: delikler kapanır, ince ayrıntı biraz yumuşar"
        >
          Delikleri kapat
        </button>
      </div>
      <NumberField
        label="Üçgen boyu"
        value={refineEdge}
        min={0.1}
        max={5}
        step={0.05}
        unit="mm"
        onChange={(v) => set({ refineEdge: v })}
      />
      <button
        type="button"
        onClick={refineSelected}
        title="Seçili parçayı küçük üçgenlere böler; ince sınırlar için"
      >
        İncelt
      </button>
      <p className="hint">Sınır tırtıklıysa önce inceltin; etiketler korunur.</p>
    </Panel>
  );
}

export function SlotPanel() {
  const keys = useKeymap((s) => s.map);
  const slots = useStore((s) => s.slots);
  const active = useStore((s) => s.activeSlot);
  const parts = useStore((s) => s.parts);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const paintVersion = useStore((s) => s.paintVersion);
  const dimOthers = useStore((s) => s.dimOthers);
  const counts = useMemo(() => {
    const part = parts.find((p) => p.id === selectedPartId);
    const n = new Map<number, number>();
    if (!part) return n;
    const labels = part.mesh.labels;
    for (let i = 0; i < labels.length; i++) {
      const id = labels[i] ?? 0;
      if (id) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return n;
  }, [parts, selectedPartId, paintVersion]);
  return (
    <Panel id="slots" title="Renkler">
      <p className="hint">
        Renk seçince o boyanın çevresi modelde görünür. Temizle boyayı siler, kaldır rengi listeden
        çıkarır.
      </p>
      <label className="field" title="Seçili renk dışındaki boyaları soldurur">
        <input
          type="checkbox"
          checked={dimOthers}
          onChange={(e) => set({ dimOthers: e.target.checked })}
        />
        <span>Seçili rengi öne çıkar</span>
      </label>
      <ul className="slots">
        {slots.map((s) => (
          <li
            key={s.id}
            className={s.id === active ? 'selected' : ''}
            onClick={() => set({ activeSlot: s.id })}
          >
            <input
              type="color"
              value={s.color}
              onChange={(e) => updateSlot(s.id, { color: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              className="name"
              value={s.name}
              onChange={(e) => updateSlot(s.id, { name: e.target.value })}
            />
            <span className="key" title={s.id <= 9 ? `Kısayol: ${s.id}` : undefined}>
              {s.id <= 9 ? s.id : ''}
            </span>
            {s.id !== 0 && (
              <button
                type="button"
                className="slot-clear"
                disabled={!(counts.get(s.id) ?? 0)}
                title="Bu rengin boyasını siler. Renk listede kalır."
                onClick={(e) => {
                  e.stopPropagation();
                  clearSlotPaint(s.id);
                }}
              >
                temizle
              </button>
            )}
            {s.id !== 0 && (
              <button
                type="button"
                className="slot-clear"
                title="Rengi listeden siler. Boyası varsa o da gider. Geri al ile döner."
                onClick={(e) => {
                  e.stopPropagation();
                  removeSlot(s.id);
                }}
              >
                kaldır
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={addSlot}>
          + Renk
        </button>
        <button
          type="button"
          onClick={autoSuggestFeatures}
          title="Göz, burun, kaş, kulak gibi çıkıntıları bulup her birini yeni slota boyar (tek Ctrl+Z ile geri alınır)"
        >
          Çıkıntıları öner
        </button>
        <button
          type="button"
          onClick={clearActiveSlot}
          title={`Seçili parçada aktif slotun tüm boyasını siler (${keys['slot.clear']}). Tek bir yeri silmek için: Smart Fill'de Shift+tık, Silgi (E) veya Ctrl/Cmd+Z`}
        >
          Seçimi temizle
        </button>
      </div>
    </Panel>
  );
}

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
export function CutActions() {
  const previewOn = useStore((s) => s.previewActive);
  const activeSlot = useStore((s) => s.activeSlot);
  const hasParts = useStore((s) => s.parts.length > 0);
  const keys = useKeymap((s) => s.map);
  const seamReady = useStore((s) => s.tool === 'seam' && !!s.line.closed && !s.line.bad);
  const disabled = !hasParts || (!seamReady && activeSlot === 0);
  return (
    <div className="cut-actions">
      <button
        type="button"
        disabled={disabled}
        className={previewOn ? 'active' : ''}
        onClick={togglePreview}
        title={`Kesimi uygulamadan göster (${keys.preview})`}
      >
        Önizleme
      </button>
      <button type="button" disabled={disabled} className="primary" onClick={runCut}>
        Kes
      </button>
    </div>
  );
}

/** Seçicide her seferinde yeni dizi yeniden çizim döngüsü yapar. */
const NO_WARNINGS: string[] = [];

export function CutPanel() {
  const keys = useKeymap((s) => s.map);
  const cut = useStore((s) => s.cut);
  const tool = useStore((s) => s.tool);
  const pinCount = useStore((s) => s.pins.length);
  const directionGizmo = useStore((s) => s.directionGizmo);
  const suggestion = useStore((s) => s.suggestion);
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
  const islands = cut.mode === 'socket' ? activeIslands() : [];
  const activeSlot = useStore((s) => s.activeSlot);
  const slotName = useStore((s) => s.slots.find((x) => x.id === s.activeSlot)?.name);
  const update = (patch: Partial<CutSettings>) => set((s) => ({ cut: { ...s.cut, ...patch } }));
  const seamGlue = tool === 'seam' && cut.mode !== 'keys';
  const modeTitle = seamGlue
    ? 'Yapıştır'
    : cut.mode === 'socket'
      ? 'Tapa'
      : cut.mode === 'keys'
        ? 'Pimli kes'
        : 'Yapıştır';
  const modeHint =
    cut.mode === 'socket'
      ? 'Göz, kaş, burun. Tapa gövdeye girer, yerinde yuva kalır.'
      : cut.mode === 'keys'
        ? 'Kol, bacak, kafa. Düz kesim ve pim.'
        : 'Yapıştırmalık kapak. Pim yok.';
  return (
    <Panel
      id="cut"
      grow
      title={`${modeTitle} — ${tool === 'seam' ? 'dikiş' : activeSlot === 0 ? 'renk seçin' : slotName}`}
    >
      <div id="kesim">
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
        {suggestion && (
          <div className={`suggestion ${suggestion.mode === cut.mode ? 'ok' : ''}`}>
            {suggestion.mode === cut.mode ? '✓ ' : 'Öneri: '}
            <b>{suggestion.mode === 'keys' ? 'Pimli kes' : 'Tapa'}</b> — {suggestion.reason}
            {suggestion.mode !== cut.mode && (
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
        {cut.mode === 'socket' && (
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
        {cut.mode === 'keys' && (
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
        {cut.mode !== 'fast' && (
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
              {cut.mode === 'socket' ? 'Tapa ile yuva' : 'Pim ile delik'} arası {cut.clearance} mm.
              Emin değilsen önce deneme parçası bas.
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
        {(tool === 'seam' || cut.mode !== 'socket') && (
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
          {cut.mode === 'socket' && (
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
          {cut.mode === 'keys' && (
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
          {cut.mode !== 'fast' && (
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
          {cut.mode !== 'socket' && (
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

export function StatusBar() {
  const busy = useStore((s) => s.busy);
  const messages = useStore((s) => s.messages);
  return (
    <div className="status">
      {busy && (
        <div className="msg busy">
          {busy}
          <button type="button" onClick={() => cancelGeometry()}>
            İptal
          </button>
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.kind}`} onClick={() => dismiss(m.id)}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
