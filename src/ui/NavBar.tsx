import type { ReactNode } from 'react';
import { useKeymap } from '../state/keymap';
import { get, set, setCameraPrefs, useStore } from '../state/store';
import { Icon, type IconName } from './icons';
import { fitAll, fitPart, fitView, viewToward } from './ViewportHost';

const VIEWS: { label: string; dir: [number, number, number] }[] = [
  { label: 'Ön', dir: [0, -1, 0.6] },
  { label: 'Arka', dir: [0, 1, 0.6] },
  { label: 'Sağ', dir: [1, 0, 0.6] },
  { label: 'Sol', dir: [-1, 0, 0.6] },
  { label: 'Üst', dir: [0, -0.2, 1] },
  { label: 'Alt', dir: [0, -0.2, -1] },
  { label: 'Eğik', dir: [1, -1, 0.9] },
];

function NavButton(props: {
  icon: IconName;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={props.active ? 'active' : ''}
      disabled={props.disabled}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.title}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={20} />
    </button>
  );
}

/** Yukarı açılan küçük kutu; dışarı tıklayınca şeritteki kapatıcı kapatır. */
function NavPop(props: { icon: IconName; label: string; title: string; children: ReactNode }) {
  return (
    <details className="ribbon-pop nav-pop">
      <summary aria-label={props.label} title={props.title}>
        <Icon name={props.icon} size={20} />
      </summary>
      <div className="pop-body">{props.children}</div>
    </details>
  );
}

function closePop(e: React.MouseEvent) {
  (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
}

/** X87: alt ortada gezinme çubuğu: sol tuş kipleri, sığdırma, görünüşler, tabla, kamera ayarı. */
export function NavBar() {
  const navMode = useStore((s) => s.navMode);
  const hasParts = useStore((s) => s.parts.length > 0);
  const selected = useStore((s) => s.selectedPartId);
  const camera = useStore((s) => s.camera);
  const keys = useKeymap((s) => s.map);
  const mode = (m: 'orbit' | 'pan' | 'zoom') => set({ navMode: get().navMode === m ? null : m });
  return (
    <div className="nav-bar" role="toolbar" aria-label="Gezinme">
      <NavButton
        icon="orbit"
        label="Döndür"
        title="Döndür: sol tuşla sürükle (Esc ya da araç seçimi bırakır). Sağ tuş her zaman döndürür"
        active={navMode === 'orbit'}
        onClick={() => mode('orbit')}
      />
      <NavButton
        icon="pan"
        label="Kaydır"
        title="Kaydır: sol tuşla sürükle (Esc bırakır). Orta tuş ya da Ctrl+sağ her zaman kaydırır"
        active={navMode === 'pan'}
        onClick={() => mode('pan')}
      />
      <NavButton
        icon="zoom"
        label="Yakınlaştır"
        title="Yakınlaştır: sol tuşla yukarı/aşağı sürükle (Esc bırakır). Tekerlek her zaman yakınlaştırır"
        active={navMode === 'zoom'}
        onClick={() => mode('zoom')}
      />
      <span className="sep" />
      <NavButton
        icon="fitAll"
        label="Hepsini sığdır"
        title="Bakış yönünü değiştirmeden bütün görünür parçaları sığdır (boşluğa çift tık)"
        disabled={!hasParts}
        onClick={fitAll}
      />
      <NavButton
        icon="fitSelected"
        label="Seçiliyi sığdır"
        title="Seçili parçayı sığdır, dönüş merkezini ona al (Alt + çift tık)"
        disabled={!selected}
        onClick={() => selected && fitPart(selected)}
      />
      <NavButton
        icon="home"
        label="Ev"
        title={`Başlangıç bakışı: önden, hepsi sığar (${keys.fit})`}
        disabled={!hasParts}
        onClick={fitView}
      />
      <NavPop icon="views" label="Görünüşler" title="Ön, arka, yan, üst, alt, eğik">
        {VIEWS.map((v) => (
          <button
            key={v.label}
            type="button"
            onClick={(e) => {
              closePop(e);
              viewToward(...v.dir);
            }}
          >
            {v.label}
          </button>
        ))}
      </NavPop>
      <span className="sep" />
      <NavButton
        icon="bed"
        label="Tabla"
        title="256 × 256 mm baskı tablası; model sığmazsa kenarı sarı (tarayıcıda hatırlanır)"
        active={camera.bed}
        onClick={() => setCameraPrefs({ ...camera, bed: !camera.bed })}
      />
      <NavPop icon="settings" label="Kamera ayarları" title="Fare düzeni ve yakınlaştırma yönü">
        <div className="pop-title">Fare düzeni</div>
        <div className="row segmented">
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
      </NavPop>
    </div>
  );
}
