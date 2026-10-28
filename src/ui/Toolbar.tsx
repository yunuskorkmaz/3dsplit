import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { CutMode } from '../core/cut';
import {
  autoSmartScale,
  autoSuggestFeatures,
  gapFillSelected,
  lineCancel,
  lineClose,
  lineUndo,
  mirrorOffset,
  modelExtent,
  refineSelected,
  removePin,
  scaleToPrintSize,
  setSmartAngle,
  setSmartOptions,
  smoothActiveRegion,
  splitSelected,
  toggleExplode,
  updatePin,
  voxelRepairSelected,
} from '../state/actions';
import { useKeymap } from '../state/keymap';
import { set, type Tool, useStore } from '../state/store';
import { NumberField, Toggle } from './fields';
import { Icon, type IconName } from './icons';
import { Panel } from './Panel';
import { cameraCssMatrix, fitView, viewToward, watchCamera } from './ViewportHost';

export const TOOLS: { id: Tool; icon: string; label: string; key: string; hint: string }[] = [
  {
    id: 'smart',
    icon: '✦',
    label: 'Akıllı seç',
    key: 'F',
    hint: 'Tıkla: çıkıntıyı seç. Shift+tık: sil.',
  },
  { id: 'brush', icon: '●', label: 'Fırça', key: 'B', hint: 'Sürükle: boya. Shift: sil.' },
  { id: 'erase', icon: '◌', label: 'Silgi', key: 'E', hint: 'Sürükle: seçimi sil. Shift: boya.' },
  {
    id: 'smooth',
    icon: '≈',
    label: 'Yumuşat',
    key: 'S',
    hint: 'Sınırın üstünde gezdir: girinti/çıkıntıyı düzeltir.',
  },
  { id: 'bucket', icon: '▣', label: 'Kova', key: 'G', hint: 'Tıkla: aynı renkli bölgeyi doldur.' },
  {
    id: 'line',
    icon: '✎',
    label: 'Çizgi',
    key: 'L',
    hint: 'Tıkla: nokta ekle. İlk noktaya tıkla ya da Enter: kapat ve boya. Backspace: son nokta, Esc: iptal.',
  },
  {
    id: 'seam',
    icon: '⌇',
    label: 'Dikiş',
    key: 'D',
    hint: 'Kapalı halka çizin. İçi boyanmaz; Kes, halkanın düzleminden ayırır. Backspace: son nokta, Esc: iptal.',
  },
  {
    id: 'pin',
    icon: '⊕',
    label: 'Pim',
    key: 'P',
    hint: 'Pime tıkla: seç (W taşı, R döndür). Boş yere tıkla: pim ekle, seçiliyken seçimi bırak. Shift+tık: sil.',
  },
];

type RibbonItem = {
  id: string;
  icon: IconName;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function RibbonButton({ item }: { item: RibbonItem }) {
  return (
    <button
      type="button"
      className={item.active ? 'active' : ''}
      disabled={item.disabled}
      onClick={item.onClick}
      title={item.title}
    >
      <Icon name={item.icon} />
      <span className="label">{item.label}</span>
    </button>
  );
}

function RibbonGroup({ name, children }: { name: string; children: ReactNode }) {
  return (
    <fieldset className="rgroup">
      <legend className="visually-hidden">{name}</legend>
      <div className="rbuttons">{children}</div>
      <span className="gname" aria-hidden="true">
        {name}
      </span>
    </fieldset>
  );
}

/** Baskı boyu: şeritte açılır kutu (alan + Ölçekle). */
function PrintSizeButton({ disabled }: { disabled: boolean }) {
  const [size, setSize] = useState(100);
  const parts = useStore((s) => s.parts);
  const extent = useMemo(() => modelExtent(parts), [parts]);
  return (
    <details className="ribbon-pop print-size-pop">
      <summary
        className={disabled ? 'disabled' : ''}
        title="En büyük parçanın en uzun kenarını verilen boya getirir"
      >
        <Icon name="printSize" />
        <span className="label">Baskı boyu</span>
      </summary>
      <div className="pop-body">
        <NumberField
          label="Baskı boyu"
          value={size}
          min={1}
          max={1000}
          step={1}
          unit="mm"
          title="En büyük parçanın en uzun kenarı bu boya gelir; bütün parçalar birlikte ölçeklenir. Ctrl+Z ile geri alınır"
          onChange={setSize}
        />
        <button
          type="button"
          onClick={(e) => {
            scaleToPrintSize(size);
            requestAnimationFrame(() => fitView());
            (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
          }}
          title={`Şu an ${extent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm`}
        >
          Ölçekle
        </button>
      </div>
    </details>
  );
}

/** X84: üstteki simgeli şerit; gruplar Seç, Kes, Mesh, Düzen. Görünüş küpü ayrı durur. */
export function ToolBar() {
  const tool = useStore((s) => s.tool);
  const keys = useKeymap((s) => s.map);
  const mode = useStore((s) => s.cut.mode);
  const hasParts = useStore((s) => s.parts.length > 0);
  const explode = useStore((s) => s.explode);
  const xray = useStore((s) => s.xray);
  const setMode = (next: CutMode) =>
    set((s) => ({ cut: { ...s.cut, mode: next }, cutModeManual: true }));
  // açık kutu dışarı tıklanınca kapanır
  useEffect(() => {
    const close = (e: PointerEvent) => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>('details.ribbon-pop[open]'))
        if (!d.contains(e.target as Node)) d.open = false;
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  const toolItem = (id: Tool): RibbonItem => {
    const t = TOOLS.find((x) => x.id === id) as (typeof TOOLS)[number];
    return {
      id,
      icon: id as IconName,
      label: t.label,
      title: `${t.label} (${keys[`tool.${id}`]}) — ${t.hint}`,
      active: tool === id,
      onClick: () => set({ tool: id }),
    };
  };
  const select: RibbonItem[] = [
    ...(['smart', 'brush', 'erase', 'smooth', 'bucket', 'line', 'seam'] as Tool[]).map(toolItem),
    {
      id: 'suggest',
      icon: 'suggest',
      label: 'Çıkıntılar',
      title:
        'Göz, burun, kaş, kulak gibi çıkıntıları bulup her birini yeni seçim setine boyar (tek Ctrl+Z ile geri alınır)',
      disabled: !hasParts,
      onClick: autoSuggestFeatures,
    },
  ];
  const cut: RibbonItem[] = [
    {
      id: 'socket',
      icon: 'socket',
      label: 'Tapa',
      title: 'Tapa: bölge gövdeye girer, gövdede yuva kalır (göz, kaş, burun)',
      active: mode === 'socket',
      onClick: () => setMode('socket'),
    },
    {
      id: 'keys',
      icon: 'keys',
      label: 'Pimli kes',
      title: 'Pimli kes: iki parça pimle birleşir (kol, kulak, baş)',
      active: mode === 'keys',
      onClick: () => setMode('keys'),
    },
    {
      id: 'fast',
      icon: 'fast',
      label: 'Yapıştır',
      title: 'Yapıştır: düz kesilir, parçalar yapıştırılır',
      active: mode === 'fast',
      onClick: () => setMode('fast'),
    },
    {
      ...toolItem('pin'),
      disabled: mode !== 'keys',
      title:
        mode === 'keys'
          ? `Pim (${keys['tool.pin']}) — ${TOOLS.find((t) => t.id === 'pin')?.hint}`
          : 'Pim: yalnız Pimli kes modunda',
    },
  ];
  const mesh: RibbonItem[] = [
    {
      id: 'split',
      icon: 'split',
      label: 'Kopukları ayır',
      title: 'Seçili parçadaki kopuk kabukları ayrı parçalara böler',
      disabled: !hasParts,
      onClick: splitSelected,
    },
    {
      id: 'repair',
      icon: 'repair',
      label: 'Onar',
      title: 'Bozuk parçayı yeniden kurar: delikler kapanır, ince ayrıntı biraz yumuşar',
      disabled: !hasParts,
      onClick: () => voxelRepairSelected(),
    },
  ];
  const arrange: RibbonItem[] = [
    {
      id: 'explode',
      icon: 'explode',
      label: 'Aralıklı',
      title: `Parçaları birbirinden ayırarak gösterir; model değişmez (${keys['view.explode']})`,
      active: explode > 0,
      disabled: !hasParts,
      onClick: toggleExplode,
    },
    {
      id: 'xray',
      icon: 'xray',
      label: 'Saydam',
      title: 'Model saydamlaşır; fırça arkasındaki yüzleri de boyar',
      active: xray,
      onClick: () => set({ xray: !xray }),
    },
  ];
  return (
    <div className="ribbon" role="toolbar" aria-label="Araçlar">
      <RibbonGroup name="Seç">
        {select.map((it) => (
          <RibbonButton key={it.id} item={it} />
        ))}
      </RibbonGroup>
      <RibbonGroup name="Kes">
        {cut.map((it) => (
          <RibbonButton key={it.id} item={it} />
        ))}
      </RibbonGroup>
      <RibbonGroup name="Mesh">
        {mesh.map((it) => (
          <RibbonButton key={it.id} item={it} />
        ))}
        <RefineButton disabled={!hasParts} />
      </RibbonGroup>
      <RibbonGroup name="Düzen">
        <PrintSizeButton disabled={!hasParts} />
        {arrange.map((it) => (
          <RibbonButton key={it.id} item={it} />
        ))}
      </RibbonGroup>
    </div>
  );
}

/** Üçgenleri böl: açılır kutuda üçgen boyu. */
function RefineButton({ disabled }: { disabled: boolean }) {
  const refineEdge = useStore((s) => s.refineEdge);
  return (
    <details className="ribbon-pop">
      <summary
        className={disabled ? 'disabled' : ''}
        title="Seçili parçayı küçük üçgenlere böler; ince sınırlar için"
      >
        <Icon name="refine" />
        <span className="label">İncelt</span>
      </summary>
      <div className="pop-body">
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
          onClick={(e) => {
            refineSelected();
            (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
          }}
        >
          İncelt
        </button>
        <p className="hint">Sınır tırtıklıysa önce inceltin; boya korunur.</p>
      </div>
    </details>
  );
}

const FACES: {
  name: string;
  n: [number, number, number];
  view: [number, number, number];
}[] = [
  { name: 'Ön', n: [0, -1, 0], view: [0, -1, 0.6] },
  { name: 'Arka', n: [0, 1, 0], view: [0, 1, 0.6] },
  { name: 'Sağ', n: [1, 0, 0], view: [1, 0, 0.6] },
  { name: 'Sol', n: [-1, 0, 0], view: [-1, 0, 0.6] },
  { name: 'Üst', n: [0, 0, 1], view: [0, -0.2, 1] },
  { name: 'Alt', n: [0, 0, -1], view: [0, -0.2, -1] },
];

const CORNERS: [number, number, number][] = [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as [number, number, number])),
);

const CUBE = 52;

/** Yüzün veya köşenin yerel eksenini dünya normaline oturtan CSS matrisi. */
function solidTransform(
  nx: number,
  ny: number,
  nz: number,
  px: number,
  py: number,
  pz: number,
): string {
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  let ux = 0;
  let uy = 0;
  let uz = 1;
  if (Math.abs(nx * ux + ny * uy + nz * uz) > 0.9) {
    ux = 0;
    uy = 1;
    uz = 0;
  }
  let xx = uy * nz - uz * ny;
  let xy = uz * nx - ux * nz;
  let xz = ux * ny - uy * nx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = -(ny * xz - nz * xy);
  const yy = -(nz * xx - nx * xz);
  const yz = -(nx * xy - ny * xx);
  return `matrix3d(${xx},${xy},${xz},0,${yx},${yy},${yz},0,${nx},${ny},${nz},0,${px},${py},${pz},1)`;
}

function cornerName(x: number, y: number, z: number): string {
  return `${y < 0 ? 'Ön' : 'Arka'} ${x > 0 ? 'sağ' : 'sol'} ${z > 0 ? 'üst' : 'alt'}`;
}

/** Modelin sağ üstünde yüzen görünüş küpü. Yüz yana, köşe çapraz bakışa gider. */
export function ViewCube() {
  const [orient, setOrient] = useState('none');
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    const pull = () => setOrient(cameraCssMatrix());
    pull();
    return watchCamera(pull);
  }, []);
  const turn = (go: () => void) => {
    setSpin(true);
    go();
    window.setTimeout(() => setSpin(false), 320);
  };
  return (
    <fieldset className="viewcube">
      <legend>Görünüş</legend>
      <div className="cube-scene">
        <div className={spin ? 'cube spin' : 'cube'} style={{ transform: orient }}>
          {FACES.map((f) => (
            <button
              key={f.name}
              type="button"
              className="face"
              style={{
                transform: solidTransform(
                  ...f.n,
                  f.n[0] * (CUBE / 2),
                  f.n[1] * (CUBE / 2),
                  f.n[2] * (CUBE / 2),
                ),
              }}
              onClick={() => turn(() => viewToward(...f.view))}
            >
              {f.name}
            </button>
          ))}
          {CORNERS.map(([x, y, z]) => (
            <button
              key={`${x}${y}${z}`}
              type="button"
              className="corner"
              aria-label={cornerName(x, y, z)}
              title={cornerName(x, y, z)}
              style={{
                transform: solidTransform(x, y, z, x * (CUBE / 2), y * (CUBE / 2), z * (CUBE / 2)),
              }}
              onClick={() => turn(() => viewToward(x, y, z))}
            />
          ))}
        </div>
      </div>
    </fieldset>
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
  const lineCount = useStore((s) => s.line.anchors.length);
  const pinGizmo = useStore((s) => s.pinGizmo);
  const keys = useKeymap((s) => s.map);
  const mirror = useStore((s) => s.mirror);
  const xray = useStore((s) => s.xray);
  useStore((s) => s.parts);
  const paintTool =
    tool === 'smart' ||
    tool === 'brush' ||
    tool === 'erase' ||
    tool === 'smooth' ||
    tool === 'bucket' ||
    tool === 'line';
  useStore((s) => s.selectedPartId);
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
      {tool === 'smart' && (
        <>
          <NumberField
            label="Açı"
            value={smartAngle}
            min={1}
            max={90}
            step={1}
            unit="°"
            title="Shift+sağ sürükle ile de değişir"
            onChange={setSmartAngle}
          />
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
            label="Yalnız çukur"
            checked={smartConcave}
            title="Sadece çukur kıvrımlarda dur; tümseklerden geç (göz, burun, kaş)"
            onChange={(v) => setSmartOptions({ smartConcave: v })}
          />
          <Toggle
            label="Dibe oturt"
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
            label="Saydam"
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
          <button
            type="button"
            onClick={smoothActiveRegion}
            title="Aktif slotun tüm sınırını tek seferde düzgün bir eğriye oturtur; alanı korur"
          >
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
          <NumberField
            label="Boşluk"
            value={gapArea}
            min={0.1}
            max={200}
            step={0.1}
            unit="mm²"
            log
            onChange={(v) => set({ gapArea: v })}
          />
          <button
            type="button"
            onClick={gapFillSelected}
            title="Bu alandan küçük renk adalarını komşu renge çevir"
          >
            Adaları birleştir
          </button>
        </>
      )}
      {(tool === 'line' || tool === 'seam') && (
        <>
          <span className="label">
            {lineCount ? `${lineCount} nokta` : 'Yüzeye tıklayarak başla'}
          </span>
          <button type="button" disabled={lineCount < 3} onClick={lineClose} title="Enter">
            {tool === 'seam' ? 'Kapat' : 'Kapat ve boya'}
          </button>
          <button type="button" disabled={!lineCount} onClick={lineUndo} title="Backspace">
            Son noktayı sil
          </button>
          <button type="button" disabled={!lineCount} onClick={lineCancel} title="Esc">
            İptal
          </button>
        </>
      )}
      {tool === 'pin' && cut.mode !== 'keys' && (
        <span className="tool-hint">
          Pimler Pimli kes'te kullanılır; şeritte Pimli kes'i seçin.
        </span>
      )}
      {tool === 'pin' && cut.mode === 'keys' && !pin && (
        <span className="label">
          Pime tıkla: seç, sonra oklarla taşı ya da halkalarla döndür · boş yere tıkla: pim ekle ·
          Shift+tık: sil
        </span>
      )}
      {tool === 'pin' && cut.mode === 'keys' && pin && (
        <>
          <span className="tool-name">Pim {selectedPin + 1}</span>
          <span className="row segmented gizmo-mode">
            <button
              type="button"
              className={pinGizmo === 'translate' ? 'active' : ''}
              onClick={() => set({ pinGizmo: 'translate' })}
              title={`Kesim düzleminde oklarla taşı (${keys['pin.move']})`}
            >
              ✥ Taşı
            </button>
            <button
              type="button"
              className={pinGizmo === 'rotate' ? 'active' : ''}
              onClick={() => set({ pinGizmo: 'rotate' })}
              title={`Ekseni halkalarla döndür (${keys['pin.rotate']})`}
            >
              ⟳ Döndür
            </button>
          </span>
          {cut.pinAuto && pin.radius === undefined && pin.length === undefined ? (
            <span
              className="label"
              title="Boyut kesitten hesaplanır; önizlemede (Space) görünür. Değer girince bu pim elle boyutlanır"
            >
              Boyut: otomatik
            </span>
          ) : (
            cut.pinAuto && (
              <button
                type="button"
                onClick={() =>
                  updatePin(
                    selectedPin,
                    { radius: undefined, length: undefined },
                    'Pim boyutu otomatik',
                  )
                }
                title="Bu pimin boyutu yeniden kesitten hesaplansın"
              >
                Otomatiğe dön
              </button>
            )
          )}
          <NumberField
            label="Yarıçap"
            value={pin.radius ?? cut.pinRadius}
            min={0.5}
            max={20}
            step={0.1}
            unit="mm"
            log
            onChange={(v) => updatePin(selectedPin, { radius: v }, 'Pim yarıçapı')}
          />
          <NumberField
            label="Boy"
            value={pin.length ?? cut.pinLength}
            min={1}
            max={60}
            step={0.5}
            unit="mm"
            log
            onChange={(v) => updatePin(selectedPin, { length: v }, 'Pim boyu')}
          />
          <NumberField
            label="Gövdede pay"
            value={Math.round((pin.bodyRatio ?? cut.pinBodyRatio) * 100)}
            min={5}
            max={95}
            step={5}
            unit="%"
            title="Bu pimin gövde tarafında kalan payı (önizleme açıksa hemen görünür)"
            onChange={(v) => updatePin(selectedPin, { bodyRatio: v / 100 }, 'Pim gövde payı')}
          />
          <button
            type="button"
            disabled={!pin.axis}
            onClick={() => updatePin(selectedPin, { axis: undefined }, 'Pim eksenini sıfırla')}
            title="Ekseni kesim yüzeyine dik yap"
          >
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
                  onClick={() =>
                    set((s) => ({ mirror: { ...s.mirror, axis: axis as 0 | 1 | 2, offset: null } }))
                  }
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
                <button
                  type="button"
                  onClick={() => set((s) => ({ mirror: { ...s.mirror, offset: null } }))}
                >
                  Ortala
                </button>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}

/** X97: ne üzerinde çalışıldığı: gövde, aktif set, aracın ne beklediği. */
function StatusLine({ hint }: { hint: string }) {
  const body = useStore((s) => s.parts.find((p) => p.id === s.selectedPartId)?.name);
  const set = useStore((s) => s.slots.find((x) => x.id === s.activeSlot));
  const navMode = useStore((s) => s.navMode);
  return (
    <p className="status-line">
      {body ? (
        <>
          Gövde: <b>{body}</b>
          {set && set.id !== 0 && (
            <>
              {' '}
              · Set: <b style={{ color: set.color }}>{set.name}</b>
            </>
          )}
        </>
      ) : (
        'Model yok'
      )}
      <br />
      {navMode ? 'Sol tuş kamerada (Esc bırakır)' : hint}
    </p>
  );
}

/** X86: sağdaki pencerenin üst bölümü: seçili aracın ayarları alt alta. */
export function ToolPanel() {
  const tool = useStore((s) => s.tool);
  const slot = useStore((s) => s.slots.find((x) => x.id === s.activeSlot));
  const keys = useKeymap((s) => s.map);
  const info = TOOLS.find((t) => t.id === tool);
  return (
    <Panel
      id="tool"
      title={
        <span className="tool-name">
          <Icon name={tool as IconName} size={16} />
          {info?.label}
          <kbd>{keys[`tool.${tool}`]}</kbd>
          {slot && tool !== 'seam' && tool !== 'pin' && (
            <span className="slot-chip" style={{ background: slot.color }}>
              {slot.name}
            </span>
          )}
        </span>
      }
    >
      <StatusLine
        hint={
          // X104: Taban aktifken Akıllı seç boyamaz, tıklanan rengi seçer
          tool === 'smart' && slot?.id === 0
            ? 'Ayıracağın renge tıkla: o set seçilir.'
            : (info?.hint ?? '')
        }
      />
      <ToolOptions />
    </Panel>
  );
}
