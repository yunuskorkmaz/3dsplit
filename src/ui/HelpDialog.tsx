import { useState } from 'react';
import { COMMANDS, useKeymap } from '../state/keymap';
import { set, useStore } from '../state/store';
import { KeymapEditor } from './KeymapPanel';
import { TOOLS } from './Toolbar';

type Tab = 'start' | 'tools' | 'mouse' | 'keys';

const TABS: { id: Tab; label: string }[] = [
  { id: 'start', label: 'İş akışı' },
  { id: 'tools', label: 'Araçlar' },
  { id: 'mouse', label: 'Fare' },
  { id: 'keys', label: 'Kısayollar' },
];

/** Araç çubuğundaki kısa ipucuna ek, yardımda gösterilen ayrıntı. */
const TOOL_DETAILS: Record<string, string> = {
  smart:
    'Çıkıntıya (göz, burun, kaş) tıkla: çevresindeki kıvrıma kadar seçer. Taşarsa üst şeritten açıyı düşür ya da Shift+sağ sürükle. Shift+tık seçimi siler.',
  brush: 'Smart Fill eksik bıraktıysa sürükleyerek ekle. Yarıçap: Alt+tekerlek veya [ ]. Shift basılıyken siler.',
  erase: 'Fazla seçilen yeri sürükleyerek geri al. Shift basılıyken boyar.',
  smooth:
    'Seçimin kenarında gezdir: tırtıklı sınırı düzgün bir eğriye çeker. Güç arttıkça daha çok düzeltir. Üst şeritteki "Tüm sınırı yumuşat" bütün sınırı bir kerede düzeltir.',
  bucket: 'Tıklanan aynı renkli bağlı bölgeyi aktif slota boyar.',
  line: 'Doğal kıvrımı olmayan bölgeler için: yüzeye noktalar tıkla, yol yüzey üzerinden en kısa yoldan geçer. İlk noktaya tıklayınca ya da Enter ile halka kapanır, içi aktif slota boyanır ve kenar çizgi boyunca düzeltilip üçgenlerin içinden geçirilir. Backspace son noktayı siler, Esc iptal eder.',
  pin: 'Keys modunda pim yerini belirler. Tık: ekle/seç, sürükle: taşı, gizmo: ekseni döndür, Shift+tık: sil.',
};

export function HelpDialog() {
  const open = useStore((s) => s.helpOpen);
  const [tab, setTab] = useState<Tab>('start');
  if (!open) return null;
  const close = () => set({ helpOpen: false });
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Yardım">
        <header className="modal-head">
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button type="button" className="close" onClick={close} title="Kapat (Esc)">
            ×
          </button>
        </header>
        <div className="modal-body">
          {tab === 'start' && <Workflow />}
          {tab === 'tools' && <Tools />}
          {tab === 'mouse' && <Mouse />}
          {tab === 'keys' && <Keys />}
        </div>
      </div>
    </div>
  );
}

function Workflow() {
  return (
    <ol className="steps">
      <li>
        <b>Yükle.</b> STL, OBJ, 3MF veya .3dsplit dosyasını pencereye sürükle. Açık (su geçirmez olmayan) mesh otomatik onarılır; olmazsa parçada
        kırmızı <span className="badge bad">!</span> çıkar, "Voxel onar"ı dene.
      </li>
      <li>
        <b>Slot seç.</b> Sağda her renk bir slottur. 1–9 tuşları slot değiştirir. Taban (0) gövdedir.
      </li>
      <li>
        <b>Bölgeyi seç.</b> Smart Fill (F) ile çıkıntıya tıkla, Fırça (B) / Silgi (E) ile düzelt, Yumuşat (S) ile kenarı düzgünleştir. Çift
        özelliklerde (iki göz) üst şeritteki Ayna'yı aç.
      </li>
      <li>
        <b>Kesim modunu seç.</b> Socket: ince, yüzeysel bölgeler (göz, kaş) — bölge tapa olur, gövdede yuva açılır. Keys: kalın bölgeler (kol, kafa) —
        düz kesim + pim. Fast: düz kesim, yapıştırmalık. Program bir öneri gösterir.
      </li>
      <li>
        <b>Toleransı ayarla.</b> Parça ile yuva arasında bırakılan boşluktur. FDM için 0.1 sıkı, 0.2 normal, 0.3 gevşek. Önce küçük bir deneme baskısı
        almak iyi olur.
      </li>
      <li>
        <b>Önizle (Space), sonra Kes.</b> Önizlemede kırmızı alanlar incelen duvardır. Kesimden sonra yeni parça listede "yeni" olarak çıkar; sonraki
        bölge için slot değiştirip devam et.
      </li>
      <li>
        <b>İncele.</b> Parça listesinde göz simgesi gizler/gösterir, Alt+tık (veya Shift+H) yalnız o parçayı gösterir, X ayrık görünümü açar.
      </li>
      <li>
        <b>Dışa aktar.</b> Üst çubuktaki Dışa aktar: Bambu/Orca 3MF (renk başına filament), genel 3MF veya STL ZIP. İşi sonra sürdürmek için
        "Projeyi kaydet".
      </li>
    </ol>
  );
}

function Tools() {
  const keys = useKeymap((s) => s.map);
  return (
    <table className="help-table">
      <tbody>
        {TOOLS.map((t) => (
          <tr key={t.id}>
            <td className="icon-cell">{t.icon}</td>
            <td>
              <b>{t.label}</b> <kbd>{keys[`tool.${t.id}`]}</kbd>
              <div className="hint">{TOOL_DETAILS[t.id] ?? t.hint}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Mouse() {
  const mode = useStore((s) => s.camera.mode);
  const rows: [string, string][] =
    mode === 'blender'
      ? [
          ['Orta tuş sürükle', 'Döndür'],
          ['Shift + orta sürükle', 'Kaydır'],
          ['Sağ sürükle', 'Kaydır'],
        ]
      : [
          ['Sağ sürükle', 'Döndür'],
          ['Boşlukta sol sürükle / Alt + sol', 'Döndür'],
          ['Orta sürükle / Ctrl(Cmd) + sağ', 'Kaydır'],
        ];
  const common: [string, string][] = [
    ['Tekerlek', 'Yakınlaştır'],
    ['Model üstünde sol tık / sürükle', 'Etkin araç'],
    ['Shift + sol', 'Aracın tersi (Smart Fill/Fırça: sil, Silgi: boya)'],
    ['Alt + tekerlek', 'Fırça yarıçapı'],
    ['Shift + sağ sürükle', 'Smart Fill açı eşiği'],
    ['Boşluğa çift tık', 'Görünümü sığdır (model kaybolursa)'],
    ['Pim aracında Shift + tık', 'Pimi sil'],
  ];
  return (
    <>
      <p className="hint">Kamera düzeni: {mode === 'blender' ? 'Blender' : 'Varsayılan'} (sol paneldeki Kamera bölümünden değişir).</p>
      <table className="help-table">
        <tbody>
          {[...rows, ...common].map(([k, v]) => (
            <tr key={k}>
              <td className="combo">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Keys() {
  return (
    <>
      <KeymapEditor />
      <p className="hint">
        Sabit: Ctrl/Cmd+Z geri al, Ctrl/Cmd+Shift+Z yinele, 0–9 slot seç, Esc pencereyi kapat. Toplam {COMMANDS.length} komutun tuşu değiştirilebilir.
      </p>
    </>
  );
}
