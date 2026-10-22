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
    'Çıkıntıya (göz, burun, kaş) tıkla: çevresindeki kıvrıma kadar seçer. Taşarsa sağdaki pencerede açıyı düşür ya da Shift+sağ sürükle. Shift+tık seçimi siler.',
  brush:
    'Smart Fill eksik bıraktıysa sürükleyerek ekle. Yarıçap: Alt+tekerlek veya [ ]. Shift basılıyken siler.',
  erase: 'Fazla seçilen yeri sürükleyerek geri al. Shift basılıyken boyar.',
  smooth:
    'Seçimin kenarında gezdir: tırtıklı sınırı düzgün bir eğriye çeker. Güç arttıkça daha çok düzeltir. Sağdaki penceredeki "Tüm sınırı yumuşat" bütün sınırı bir kerede düzeltir.',
  bucket: 'Tıklanan aynı renkli bağlı bölgeyi aktif slota boyar.',
  line: 'Doğal kıvrımı olmayan bölgeler için: yüzeye noktalar tıkla, yol yüzey üzerinden en kısa yoldan geçer. İlk noktaya tıklayınca ya da Enter ile halka kapanır, içi aktif slota boyanır ve kenar çizgi boyunca düzeltilip üçgenlerin içinden geçirilir. Backspace son noktayı siler, Esc iptal eder.',
  seam: 'Kol ve bacak için: yüzeye kapalı bir halka çiz. İçi boyanmaz. Kes, halkanın düzleminden iki parça ayırır. Pimli kes seçiliyse kesite pim konur; değilse yapıştırmalık kalır. Halka düz değilse ya da düzlem modeli birden fazla yerden kesiyorsa kesim durur ve halka kırmızı çizilir.',
  pin: 'Keys modunda pimleri düzenler. Pimler kesim yüzeyinde gerçek boyutlarıyla yarı saydam görünür. Pime tıkla: seçilir; W ile taşıma okları (kesim düzleminde), R ile döndürme halkaları çıkar, sürüklerken pim anlık hareket eder. Pimi yüzeyde sürükleyerek de taşıyabilirsin. Seçiliyken boş yere tıklamak ya da Esc seçimi bırakır; seçili pim yokken boş yere tıklamak yeni pim ekler. Shift+tık siler. Otomatik pime tıklayınca pimler o yerlerde elle düzenlenebilir hale gelir.',
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
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
              >
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
        <b>Yükle.</b> STL, OBJ, 3MF veya .3dsplit dosyasını pencereye sürükle. Açık (su geçirmez
        olmayan) mesh otomatik onarılır; olmazsa parçada kırmızı “bozuk” yazar, şeritte Mesh ›
        Onar’ı dene. Çalışma tarayıcıda kendiliğinden saklanır: sayfa yenilenince boş ekrandaki
        “Devam et” kaldığın yere döner.
      </li>
      <li>
        <b>Renk seç.</b> Soldaki Model ağacında Renkler'de her satır bir renktir. 1–9 tuşları rengi
        değiştirir. Taban (0) gövdedir. Gövdeler'de her parçanın altında o parçadaki boyalı renkler
        üçgen sayısıyla durur; birine tıklamak parçayı ve rengi seçer.
      </li>
      <li>
        <b>Bölgeyi seç.</b> Smart Fill (F) ile çıkıntıya tıkla, Fırça (B) / Silgi (E) ile düzelt,
        Yumuşat (S) ile kenarı düzgünleştir. Çift özelliklerde (iki göz) sağdaki pencerede Ayna'yı
        aç. Renk satırındaki göz boyayı yalnız görüntüde gizler. Satırdaki ⋯ ya da sağ tık: “Seçili
        parçada temizle” boyayı siler, “Rengi kaldır” rengi listeden çıkarır. Tek bir yeri silmek
        için Akıllı seç’te Shift+tık, Silgi, "Seçimi temizle" (Delete) ya da Ctrl/Cmd+Z. Alttaki
        Geçmiş şeridinde bir adıma tıklayıp o ana dönebilirsin.
      </li>
      <li>
        <b>Kesim modunu seç.</b> Üst şeritte Tapa: ince bölgeler (göz, kaş). Pimli kes: kalın
        bölgeler (kol, kafa). Yapıştır: pimsiz düz kesim. Seçili rengin çevresi ve adı modelin
        üstünde durur.
      </li>
      <li>
        <b>Toleransı ayarla.</b> Pim ile delik, tapa ile yuva arasında bırakılan boşluktur. FDM için
        0.1 sıkı, 0.2 normal, 0.3 gevşek. Önce küçük bir deneme baskısı almak iyi olur. Yüz boşluğu
        ayrıdır: düz kesilen yüzler birbirine değmesin diye aralarına konur; 0 ise değerler.
      </li>
      <li>
        <b>Önizle (Space), sonra Kes.</b> Önizleme açıkken ayar değiştirip pim ekleyip
        sürükleyebilirsin; önizleme kapanmaz, kendini yeniler. Pimin gövdeye ne kadar gireceği
        “Gövdede pay” ile (pim aracında tek pim için de) ayarlanır. Kırmızı alanlar incelen
        duvardır. Kesimden sonra yeni parça listede “yeni” olarak çıkar; sonraki bölge için rengi
        değiştirip devam et.
      </li>
      <li>
        <b>İncele.</b> Parça listesinde göz simgesi gizler/gösterir, Alt+tık (veya Shift+H) yalnız o
        parçayı gösterir. Şeritte Düzen › Aralıklı, parçaları birbirinden ayırarak gösterir; Saydam,
        fırçanın arkadaki yüzleri de boyamasını sağlar.
      </li>
      <li>
        <b>Dışa aktar.</b> Üst çubuktaki Dışa aktar: Bambu/Orca 3MF (renk başına filament), genel
        3MF veya STL ZIP. İşi sonra sürdürmek için "Projeyi kaydet".
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
    ['Tekerlek', 'İmlecin altına yakınlaştır'],
    ['Model üstünde sol tık / sürükle', 'Etkin araç'],
    ['Shift + sol', 'Aracın tersi (Smart Fill/Fırça: sil, Silgi: boya)'],
    ['Alt + tekerlek', 'Fırça yarıçapı'],
    ['Shift + sağ sürükle', 'Smart Fill açı eşiği'],
    ['Boşluğa çift tık', 'Görünümü sığdır (model kaybolursa)'],
    ['Başka parçaya çift tık / Alt + çift tık', 'O parçayı sığdır'],
    ['Döndürme', 'Seçili parçanın ortası etrafında'],
    ['Sağ üst küp: yüz', 'Kamerayı o yana alır; küp de o yöne döner'],
    ['Küpün köşesi', 'Çapraz (köşe) bakış'],
    ['Pim aracında Shift + tık', 'Pimi sil'],
  ];
  return (
    <>
      <p className="hint">
        Kamera düzeni: {mode === 'blender' ? 'Blender' : 'Varsayılan'} (alttaki gezinme çubuğunda ⚙
        ile değişir). Çubuktaki Döndür, Kaydır ve Yakınlaştır sol tuşu kameraya verir; Esc bırakır.
      </p>
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
        Sabit: Ctrl/Cmd+Z geri al, Ctrl/Cmd+Shift+Z yinele, 0–9 slot seç, Esc pencereyi kapat.
        Toplam {COMMANDS.length} komutun tuşu değiştirilebilir.
      </p>
    </>
  );
}
