# 3. aşama: arayüz eleştirisi

26 Ekim 2026. Google Chrome 155 (Playwright, `channel: 'chrome'`, 1440 × 900), dev sunucusu `http://localhost:5173`. Uygulama üç görevle kullanıldı:

- **(a)** `~/Downloads/Bluey_Color.3mf`: gözbebeğini (siyah, "Filament 4" seti) Tapa ile ayırıp 3MF almak.
- **(b)** `samples/figure.stl`: sol kolu Çizgi ile çevirip Pimli kes ile ayırmak.
- **(c)** Tolerans deneme parçası üretip yalnız onu dışa aktarmak ve ayar seçmek.

Ek durumlar `samples/broken.stl`, `samples/testa-1m.stl` (1.890.376 üçgen), bozuk ve desteklenmeyen dosyalarla denendi. Süreler `Date.now()` farkıyla, kontrast değerleri `getComputedStyle` ile alınan renklerden WCAG formülüyle hesaplandı. Scriptler: `/private/tmp/claude-501/-Users-yunuskorkmaz-Projects-3dsplit/3b196ea1-5eea-459e-a40e-7aaa8e9d15e4/scratchpad/s3/`.

Önem ölçeği: **Kritik** (görevi bozar ya da yanlış fiziksel parça üretir), **Yüksek** (ciddi zorluk, emek ya da güven kaybı), **Orta** (geçici çözümü olan sürtünme), **Düşük** (kozmetik).

## Ölçülen ana akışlar

| Görev | Tık | Bekleme | Sonuç |
| --- | --- | --- | --- |
| (a) Bluey gözbebeği, Tapa, 3MF | 7 (Aç, dosya, Filament 4, Tapa, Kes, Dışa aktar, 3MF — Bambu) | açılış 2,1 s; önizleme 0,96 s; kesim 17,8 s; 3MF 1,4 s | `quant_1.3mf` 7.609.044 bayt indi; 4 gövde |
| (a) yalnız klavye | 242 tuş (çoğu Tab) | aynı | 3MF indi |
| (b) figür kolu, Çizgi + Pimli kes | 19 (Aç, dosya, Çizgi, Ön, 8 nokta, Görünüşler + Arka, Enter, Görünüşler + Ön, Kes, Aralıklı) | açılış 0,3 s; canlı önizleme 0,8 s; kesim 1,1 s | 2 gövde, kolda pim ([03-b-exploded.png](img/03-b-exploded.png)) |
| (c) deneme parçası + yalnız onu dışa aktarma | 1 + 3 (göz, Dışa aktar, STL (ZIP)) | üretim 1,5 s | `parts.zip`: plaka + 3 pim STL |

---

## 1. Heuristik değerlendirme ve excise denetimi (design-critique)

### 1.1 Nielsen'in 10 heuristiği

#### H1 Sistem durumunun görünürlüğü

**H1-1 Kritik: Set seçince kesim modu birkaç saniye eski öneriyle değişiyor; o arada basılan Kes yanlış modla kesiyor.**
Bluey açılınca aktif set beyaz "Seçim 1", öneri "Pimli kes — kalın çıkıntı (~17.5 mm)". Ağaçta "Filament 4"e (gözbebekleri) tıklayınca panel 100 ms içinde **aynı** öneriyi ✓ ile gösteriyor ve mod Pimli kes'e geçiyor. Doğru öneri ("Tapa — yüzeysel bölge (~0.8 mm)") 2–4 s sonra geliyor ve mod Tapa'ya dönüyor (ölçüm: 100/500/1000/2000 ms'de `mode: keys`, 4000 ms'de `socket`). Bu arada Kes'e basılan denemede kesim "Pimli kes · Filament 4" ile yapıldı, uyarı "3 bölgede kesit pin için çok ince; pin konmadı" çıktı. Kesimden sonra şerit ve başlık "TAPA — FİLAMENT 4" gösteriyor, yani ekran yapılmış kesimin modunu değil sonradan gelen öneriyi söylüyor. Kullanıcı pimsiz düz kesilmiş gözbebeklerini basar.
Kanıt: [03-a-tapa-preview.png](img/03-a-tapa-preview.png) (Filament 4 seçili, öneri hâlâ 17.5 mm), [03-a-exploded.png](img/03-a-exploded.png) (başlık Tapa, ileti "Pimli kes · Filament 4"). Tekrar: Bluey'i aç → Filament 4 → 2,5 s içinde Kes. Aynı sette ilk seçimde öneri 0,8 mm Tapa, Seçim 1'e uğradıktan sonra 17,5 mm Pimli kes (önbellek eski kalıyor).
Dayanak: H1, H5; kaybolan iş (yanlış parça, Ctrl+Z ile geri alınabilir ama fark edilmezse baskıya gider).
Öneri: öneri hesaplanırken eski öneriyi gösterme, "Öneri hesaplanıyor…" yaz ve Kes'i o süre için kapat; kesim iletisindeki mod ile şerit her zaman aynı olsun.

**H1-2 Orta: Geri alındıktan sonra eski "kesildi" iletisi ekranda kalıyor, geri alma için ileti yok.**
Figürde Kes 2 sonrası Ctrl+Z: gövde sayısı 3 → 2 (0,64 s), ama "Kes 2: Gövde 2 ayrıldı…" iletisi duruyor. Geçmiş şeridindeki işaret değişiyor, başka geri bildirim yok.
Kanıt: [03-undo-cut.png](img/03-undo-cut.png). Dayanak: H1.
Öneri: geri alınınca "Geri alındı: Kes 2" iletisi, eski kesim iletisi kalksın.

**H1-3 Orta: Kesim yapılmadan adım şeridi "✓ Kes" ve "Aktar" gösteriyor.**
Örnek figürde yalnız "Deneme parçası üret"e basınca şerit Aç ✓, Seç ✓, Kes ✓, Aktar (aktif) oldu.
Kanıt: [03-c-result.png](img/03-c-result.png). Dayanak: H1 (yanlış ilerleme bilgisi), Goal-gradient.

**H1-4 Düşük: Uzun işlemde yüzde ya da kalan süre yok.**
Meşgul kartı iş adı, aşama ("Tapa ve yuva hacmi kuruluyor…") ve geçen saniyeyi gösteriyor; 12–18 s süren kesimde ne kadar kaldığı yok. İlk saniyede aşama satırı boş.
Kanıt: [03-a-cutting.png](img/03-a-cutting.png), [03-big-cutting10.png](img/03-big-cutting10.png). Dayanak: H1, 10 s eşiği (Nielsen yanıt süreleri).

#### H2 Sistem ile gerçek dünya arasında uyum

**H2-1 Yüksek: Hedef kullanıcının bilmediği terimler ana yolda.**
Görülen metinler: "slot" (açılış iletisi "5 filament rengi slotlara aktarıldı", Kısayollar "Aktif slotun seçimini temizle", "0–9 slot seç"), "Mesh" (şerit grubu), "kopuk kabuklar", "üçgen" sayıları her satırda, "Ölçek (oto)", "Yalnız çukur", "Dibe oturt", "Snap", İnce ayar'da "Gövdede pay %", "Uç pahı", "Duvar", "Boy boşluğu", "yüzeysel bölge (yükseklik ~30.2 mm)". Ayrıntı §3.
Kanıt: [03-bluey-loaded.png](img/03-bluey-loaded.png), [03-w-pimli-kes-advanced.png](img/03-w-pimli-kes-advanced.png), [03-help-keys.png](img/03-help-keys.png). Dayanak: H2.

**H2-2 Orta: Boyalı 3MF'te setler iki farklı adla geliyor.**
Bluey'de setler "Seçim 1, Seçim 2, Seçim 3, Filament 4, Filament 5". Kullanıcı gözü ada göre değil renk karesine bakarak buluyor.
Kanıt: [03-bluey-loaded.png](img/03-bluey-loaded.png). Dayanak: H2, H4.

#### H3 Kullanıcı kontrolü ve özgürlük

Olumlu: Kesim ve boyama Ctrl+Z / Ctrl+Shift+Z ile geri ve ileri alınıyor (figür 0,64 s, 1,89M üçgen 1,8 s). Esc uzun kesimi 0,8 s içinde durduruyor, ileti "İşlem iptal edildi. Model değişmedi."

**H3-1 Orta: Aynı anda iki "İptal" düğmesi var, anlamları farklı.**
Kesim sürerken meşgul kartında "İptal" (işlemi durdurur), araç penceresinde "İptal" (önizlemeyi kapatır). İkisi de görünür. Denemede araç penceresindeki İptal'e basıldı, kesim sürdü ve tamamlandı.
Kanıt: [03-big-cutting10.png](img/03-big-cutting10.png). Dayanak: H3, H4.
Öneri: araç penceresindeki düğme "Önizlemeyi kapat", meşgul kartındaki "Kesimi durdur".

#### H4 Tutarlılık ve standartlar

**H4-1 Yüksek: Dikiş aracında başlık, şerit ve içerik üç farklı mod söylüyor.**
Dikiş seçiliyken şeritte Tapa vurgulu, pencere başlığı "YAPIŞTIR — DİKİŞ", altında Tapa açıklaması ("Göz, kaş, burun. Tapa gövdeye girer…") ve Tapa "Derinlik" alanı.
Kanıt: [03-seam-fail.png](img/03-seam-fail.png). Dayanak: H4.

**H4-2 Yüksek: Aynı kavrama farklı adlar.** Akıllı seç / Smart Fill; Pimli kes / Keys; set / slot / Seçim / Filament / renk; Tapa modunda deneme parçası iletisi "Pimleri takıp". Ayrıntı §3.

**H4-3 Düşük: Ondalık ayırıcı karışık.** "0.2 mm", "~17.5 mm" (nokta) ile giriş alanlarında "0,4", "1,89 milyon" (virgül) yan yana. Üçgen sayısı "2252" ve "2.364" iki biçimde. Kanıt: [03-b-line-closed.png](img/03-b-line-closed.png), [03-w-pimli-kes-advanced.png](img/03-w-pimli-kes-advanced.png).

#### H5 Hata önleme

**H5-1 Orta: Önizleme kesimin yapılamayacağını söylerken Kes açık kalıyor.**
Kova ile bütün figür boyanınca önizleme "Bölge parçanın tamamını kaplıyor; kesilecek sınır yok" diyor; Kes yine yeşil ve tıklanabilir, basınca aynı hata ikinci kez yazılıyor.
Kanıt: [03-fail-cut.png](img/03-fail-cut.png). Dayanak: H5.

H1-1 de bu başlığa girer (eski öneri ile kesim).

#### H6 Hatırlamak yerine tanıma

**H6-1 Orta: Tolerans düğmeleri değer göstermiyor, deneme parçası değerle etiketli.**
Plaka "0.1 / 0.2 / 0.3 mm" ve çentik sayısıyla geliyor; düğmeler "Sıkı / Normal / Gevşek". Eşleşmeyi yalnız seçili düğmenin altındaki cümle söylüyor ("Pim ile delik arası 0.2 mm"). Baskıdan sonra kullanıcı 2 çentikli deliğin hangi düğme olduğunu hatırlamak ya da her düğmeye basıp okumak zorunda.
Kanıt: [03-c-plate-zoom.png](img/03-c-plate-zoom.png). Dayanak: H6, hafıza excise'ı.
Öneri: "Sıkı 0,1 · Normal 0,2 · Gevşek 0,3" ya da "1 çentik / 2 çentik / 3 çentik".

**H6-2 Orta: Dar alanlarda adlar kesiliyor.** Set listesinde "Filament 4" ve "Filament 5" → "Filament ·"; gövde listesinde üç pim de "Tolerans pimi", plaka "Tolerans plal". Kanıt: [03-a-cut-done.png](img/03-a-cut-done.png), [03-c-result.png](img/03-c-result.png). Dayanak: H6.

#### H7 Esneklik ve verimlilik

Olumlu: tek harfli araç kısayolları, değiştirilebilir 20 kısayol, Ctrl/Cmd+K komut arama, Space önizleme.

**H7-1 Orta: Çizgi halkasını kapatmak için kamerayı iki kez çevirmek gerekiyor.** Kolun arkası önden görünmüyor; Görünüş küpünün "Arka" yüzü önden bakınca tıklanamıyor (Playwright: "Üst intercepts pointer events"). Alt çubukta Görünüşler → Arka, sonra geri Ön: 4 tık. Kanıt: [03-b-line-front.png](img/03-b-line-front.png), [03-b-line-closed.png](img/03-b-line-closed.png). Dayanak: ölçülebilir sürtünme (19 tıkın 4'ü gezinme).

#### H8 Estetik ve sade tasarım

**H8-1 Düşük: Model yokken araç ayarları dolu görünüyor.** Boş ekranda araç penceresinde "Model yok" altında Açı 20°, Ölçek, Yalnız çukur, Dibe oturt, Ayna; kırmızı "SEÇİM 1" rozeti; Fırça, Kova, Tapa, Pimli kes etkin. Kanıt: [03-empty.png](img/03-empty.png). Dayanak: H8, boş durum deseni.

**H8-2 Orta: İletiler üst üste yığılıp modelin altını kapatıyor.** Üç ileti (Dikiş hazır, Kes 1, Kes 2) birlikte ~150 px yer tutuyor; biri geri alınmış işi anlatıyor. Kanıt: [03-undo-cut.png](img/03-undo-cut.png). Dayanak: H8, H1.

#### H9 Hataları tanıma, teşhis ve kurtarma

**H9-1 Yüksek: Bozuk dosyada ham İngilizce istisna metni.**
5 KB rastgele bayt `.stl`: "Invalid typed array length: 37234003005". Zip olmayan `.3mf`: "THREE.ThreeMFLoader: Cannot find relationship file `rels` in 3MF archive." Kaynak: `src/state/actionsHooks.ts:52` istisnanın `message`'ını olduğu gibi gösteriyor.
Kanıt: [03-err-garbage-stl.png](img/03-err-garbage-stl.png), [03-err-garbage-3mf.png](img/03-err-garbage-3mf.png). Dayanak: H9.

**H9-2 Orta: Kesim hatası çözüm söylemiyor.** "Bölge parçanın tamamını kaplıyor; kesilecek sınır yok." Ne yapılacağı (bir kısmı silmek, başka set) yok. Kanıt: [03-fail-cut.png](img/03-fail-cut.png).

**H9-3 Düşük: "Desteklenmeyen dosya türü: .txt"** desteklenen türleri saymıyor. Kanıt: [03-err-not-a-model-txt.png](img/03-err-not-a-model-txt.png).

Olumlu: `broken.stl` açılınca "broken: 3953 üçgenin yönü düzeltildi, 2 delik kapatıldı." deniyor ve model kullanılabiliyor ([03-err-broken.png](img/03-err-broken.png)).

#### H10 Yardım ve dokümantasyon

**H10-1 Yüksek: Yardım'ın "İş akışı" sekmesi okunamıyor.**
8 adımlık liste dokuz dar sütuna bölünüyor, başlıklar üst üste biniyor ("Seçim set2. Bölgeyi seç."). Neden: başlıktaki adım şeridinin `.steps { display: flex }` kuralı (`src/ui/styles.css:370`) yardımdaki `<ol className="steps">`'a (`src/ui/HelpDialog.tsx:69`) da uyuyor.
Kanıt: [03-help-empty.png](img/03-help-empty.png). Dayanak: H10.

**H10-2 Orta: Yardım davranışla çelişiyor.** Dikiş yardımı: "Halka düz değilse … kesim durur ve halka kırmızı çizilir." Gerçekte düz olmayan halkada ileti "Dikiş hazır. Çizgi düz değil; Kes, çizilen halkayı izler." ve kesim yapıldı. Kanıt: [03-seam-fail.png](img/03-seam-fail.png), Yardım › Araçlar › Dikiş.

### 1.2 Excise denetimi

| Görev | Adım | Tür | Maliyet | Gerekli mi |
| --- | --- | --- | --- | --- |
| (a) | Gözbebeğinin hangi set olduğunu renk karesinden bulmak ("Filament 4") | bilişsel | 5 satır taranır | Hayır: set rengi modelde ad etiketiyle de gösteriliyor ama listede ad anlamsız |
| (a) | Tapa'ya elle basmak | bilişsel + fiziksel | 1 tık; basılmazsa 2–4 s pencerede yanlış kesim (H1-1) | Hayır: öneri doğru hesaplansa 0 tık |
| (a) | Kesimi beklemek | bekleme | 17,8 s, ekran kilitli değil ama kesim sürerken Kes düğmesi görünür | Kısmen |
| (a) klavye | Model ağacına inmek için Görünüş küpünün 14 düğmesinden geçmek | gezinme | her turda 14 Tab | Hayır |
| (b) | Halkayı kapatmak için kamera: Görünüşler → Arka, sonra Görünüşler → Ön | gezinme / pencere | 4 tık, ~2 s | Hayır: küp yüzü önden tıklanamıyor |
| (b) | Sonucu görmek için Aralıklı | gezinme | 1 tık | Kısmen |
| (c) | Deneme parçasının bir kısmı araç penceresinin arkasında kalıyor | görsel | parçayı görmek için sığdırma: 2 tık (satır + Seçiliyi sığdır) | Hayır |
| (c) | 40 sözcüklük iletiyi okumak (çentik eşlemesi) | bilişsel | ~10 s | Kısmen |
| (c) | Yalnız deneme parçasını aktarmak için figürü gizlemek | fiziksel | 1 tık + doğru menü (STL ZIP) 2 tık | Hayır: "Deneme parçasını STL indir" tek düğme olabilir |
| (c) | Ayarı seçerken çentik → Sıkı/Normal/Gevşek eşlemesini hatırlamak | hafıza | 3 düğmeyi tek tek okumak | Hayır (H6-1) |
| (c) | Deneme parçası modelde 4 gövde ve İşlemler'de 4 "Aç" kaydı olarak kalıyor | görsel | asıl modeli aktarmadan önce gizlemek ya da silmek gerekir | Hayır |

---

## 2. Durum envanteri (interaction-design)

| Durum | Tetikleme | Görülen | Beklenen | Eksik | Kanıt |
| --- | --- | --- | --- | --- | --- |
| Yükleniyor (küçük) | Bluey 9,4 MB 3MF | 2,1 s sonra model; ara durum kısa | dosya adı + süre | yok | [03-bluey-loaded.png](img/03-bluey-loaded.png) |
| Yükleniyor (büyük) | `testa-1m.stl` 94,5 MB | "testa-1m.stl yükleniyor… 1 sn [İptal]" kartı; boş ekran metni ve Aç / Örnek modeli aç düğmeleri arkada etkin; toplam 4,9 s | yükleme sırasında boş ekran düğmeleri kapalı | ilerleme yüzdesi; boş ekran yükleme sırasında da "Modeli aç" diyor | [03-big-loading.png](img/03-big-loading.png) |
| Büyük model uyarısı | 1,89M üçgen açılınca | "Bu model 1,89 milyon üçgen… [Sadeleştir] [Olduğu gibi kalsın]" | karar sorusu ve etkisi | etkisi "milimetrenin onda biri kadar oynar" diye anlatılıyor, iyi | [03-big-painted.png](img/03-big-painted.png) |
| Boş: model yok | ilk açılış | ortada "Modeli aç, bölgeyi seç, kes, slicer'a aktar. [Aç] [Örnek modeli aç]"; solda sürükle bırak metni | aynı | araç penceresi dolu ayarlar ve "SEÇİM 1" rozeti gösteriyor (H8-1) | [03-empty.png](img/03-empty.png) |
| Boş: seçim yok | model açık, boya yok | "Seçim yok: önce bir bölge boyayın (Seçim 1)."; Kes ve İptal soluk | aynı | yok | [03-err-broken.png](img/03-err-broken.png) |
| Hata: onarılabilir mesh | `samples/broken.stl` | 0,8 s; "broken: 3953 üçgenin yönü düzeltildi, 2 delik kapatıldı."; gövdede onarım yaması görünüyor | onarım + bilgi | "yön", "delik" teknik ama anlaşılır | [03-err-broken.png](img/03-err-broken.png) |
| Hata: desteklenmeyen tür | `.txt`, `.png` | "Desteklenmeyen dosya türü: .txt"; model yok | tür + desteklenenler | desteklenen türler yok; dosya penceresi `accept=.stl,.obj,.3mf,.3dsplit` ile zaten süzüyor, sürükle bırakta ileti tek savunma | [03-err-not-a-model-txt.png](img/03-err-not-a-model-txt.png), [03-err-fake-png.png](img/03-err-fake-png.png) |
| Hata: bozuk dosya | rastgele bayt `.stl`, zip olmayan `.3mf` | ham İngilizce istisna (H9-1) | "Dosya okunamadı: STL değil ya da bozuk. Slicer'dan yeniden dışa aktarın." | Türkçe, eylemli metin | [03-err-garbage-stl.png](img/03-err-garbage-stl.png), [03-err-garbage-3mf.png](img/03-err-garbage-3mf.png) |
| Hata: kesim başarısız | figürün tamamı Kova ile boyanır, Kes | önizleme hatası + kesim hatası, aynı metin iki kez; Kes açık | Kes kapalı, tek ileti, çözüm önerisi | H5-1, H9-2 | [03-fail-cut.png](img/03-fail-cut.png) |
| Uzun işlem: kesim | Bluey Tapa 17,8 s; testa-1m Tapa 12,1 s | kart: iş adı, aşama, geçen sn, İptal; Esc 0,8 s içinde iptal eder, "İşlem iptal edildi. Model değişmedi." | aynı + yüzde/kalan süre | yüzde yok; iki ayrı "İptal" (H3-1) | [03-big-cutting10.png](img/03-big-cutting10.png), [03-a-cutting.png](img/03-a-cutting.png) |
| Uzun işlem: önizleme | testa-1m, Tapa | önizleme kendiliğinden açıldı | aynı | yok | [03-big-preview.png](img/03-big-preview.png) |
| Geri al: boyama | figür burnu Akıllı seç → Cmd+Z → Cmd+Shift+Z | 322 → 0 → 322 üçgen; şeritte adım soluklaşıyor | geri al iletisi | ileti yok | [03-undo-paint.png](img/03-undo-paint.png) |
| Geri al: kesim | Kes 2 → Cmd+Z → Cmd+Shift+Z | 0,64 s; gövde 3 → 2 → 3; eski kesim iletisi kalıyor | "Geri alındı: Kes 2" | H1-2 | [03-undo-cut.png](img/03-undo-cut.png), [03-redo-cut.png](img/03-redo-cut.png) |
| Geri al: büyük model kesimi | testa-1m kesim → Cmd+Z | 1,83 s, gövde 1'e döndü | 1 s üstünde gösterge | gösterge görülmedi (ölçüm sırasında meşgul kartı yakalanmadı) | — |
| Büyük model: boyama tepkisi | testa-1m, Akıllı seç tık | 0,62 s'de 20.466 üçgen boyandı | < 1 s | yok | [03-big-painted.png](img/03-big-painted.png) |
| Büyük model: fırça sürükleme | testa-1m, Fırça, 30 adımlık sürükleme | kare süresi ortanca 16,6 ms, %95'lik 148 ms, en çok 169 ms | < 50 ms (Doherty 400 ms altında ama takılma görünür) | sürükleme sırasında takılma | ölçüm: `ebig.mjs` |
| Büyük model: kesim | testa-1m, 2 bölge Tapa | 12,1 s | ilerleme + iptal | yüzde | [03-big-cutting10.png](img/03-big-cutting10.png) |
| Başarı: dışa aktarma | Dışa aktar → 3MF — Bambu | 1,4 s; ileti "3MF hazır. Bambu/Orca'da filamentlere renk ata — Filament 1: Taban, Filament 2: Filament 4." | indirilen dosya adı + sonraki adım | ileti metni karışık (§3) | [03-kb-palette.png](img/03-kb-palette.png) (alt ileti) |
| Deneme parçası | Pimli kes / Tapa → Deneme parçası üret | 1,5 s; 4 gövde eklendi; 40 sözcüklük ileti | parça görünür yerde | parçanın sağı araç penceresinin altında; adım şeridi yanlış ilerliyor (H1-3) | [03-c-result.png](img/03-c-result.png), [03-c-plate-zoom.png](img/03-c-plate-zoom.png) |

---

## 3. Türkçe arayüz metinleri (ux-writing)

| # | Mevcut metin | Yer | Sorun | Önerilen metin | Önem |
| --- | --- | --- | --- | --- | --- |
| W1 | "Invalid typed array length: 37234003005" | [03-err-garbage-stl.png](img/03-err-garbage-stl.png) | İngilizce, iç hata, eylem yok | "Dosya okunamadı. STL bozuk ya da başka bir biçimde. Slicer'dan yeniden STL olarak kaydedip deneyin." | Yüksek |
| W2 | "THREE.ThreeMFLoader: Cannot find relationship file `rels` in 3MF archive." | [03-err-garbage-3mf.png](img/03-err-garbage-3mf.png) | aynı | "3MF dosyası açılamadı: içi bozuk. Bambu Studio ya da Orca'da açıp yeniden kaydedin." | Yüksek |
| W3 | Ribbon "Akıllı seç" / Kısayollar ve Yardım "Smart Fill" | [03-help-keys.png](img/03-help-keys.png) | aynı araca iki ad | her yerde "Akıllı seç" | Orta |
| W4 | Ribbon "Pimli kes" / Yardım "Keys modunda pimleri düzenler" | Yardım › Araçlar › Pim | eski İngilizce mod adı | "Pimli kes modunda pimleri düzenler" | Orta |
| W5 | "slot" (açılış: "5 filament rengi slotlara aktarıldı"; Kısayollar: "Aktif slotun seçimini temizle", "0–9 slot seç"; Yardım: "aktif slota boyar") | [03-bluey-loaded.png](img/03-bluey-loaded.png), [03-help-keys.png](img/03-help-keys.png) | ağaçta aynı şeyin adı "Seçim seti"; "slot" jargon | "5 renk seçim seti olarak geldi"; "Aktif seti temizle"; "0–9: set seç"; "aktif sete boyar" | Orta |
| W6 | Set adları "Seçim 1… Seçim 3, Filament 4, Filament 5" | [03-bluey-loaded.png](img/03-bluey-loaded.png) | aynı listede iki adlandırma | hepsi "Renk 1 … Renk 5" ya da renk adı ("Siyah", "Turuncu") | Orta |
| W7 | "3MF hazır. Bambu/Orca'da filamentlere renk ata — Filament 1: Taban, Filament 2: Filament 4." | Dışa aktarma iletisi, [03-kb-palette.png](img/03-kb-palette.png) | "Filament 2: Filament 4" okunmuyor; "Taban" kullanıcıya görünmeyen bir ad | "3MF indirildi. Slicer'da 1. filament: gövde rengi, 2. filament: siyah (Filament 4 seti)." | Orta |
| W8 | "boşluk" dört ayrı anlamda: Kova "Boşluk mm²", Pimli kes "Yüz boşluğu", İnce ayar "Boşluk" (Tolerans düğmeleriyle aynı değer), "Boy boşluğu" | [03-w-pimli-kes-advanced.png](img/03-w-pimli-kes-advanced.png), [03-fail-cut.png](img/03-fail-cut.png) | aynı sözcük farklı ölçü; İnce ayar'daki "Boşluk" Tolerans'ı ikinci kez soruyor | Kova: "Doldurulacak delik (mm²)"; "Yüz boşluğu" → "Kesik yüzler arası"; İnce ayar "Boşluk" kaldır ya da "Tolerans (mm)"; "Boy boşluğu" → "Pim ucu payı" | Orta |
| W9 | "Sıkı / Normal / Gevşek" | Tolerans, [03-c-plate-zoom.png](img/03-c-plate-zoom.png) | değer yok; deneme parçası değerle etiketli | "Sıkı 0,1", "Normal 0,2", "Gevşek 0,3" | Orta |
| W10 | Tapa modunda: "Deneme parçası eklendi: … Pimleri takıp en iyi oturanı seçin"; gövde adları "Tolerans pimi 1–3" | [03-c-plate-zoom.png](img/03-c-plate-zoom.png) | Tapa modunda "pim" | modda göre: "Tapaları takıp en sıkı oturanı seçin" | Düşük |
| W11 | "Deneme parçası eklendi: boşluklar soldan sağa 0.1 / 0.2 / 0.3 mm (deliğin önündeki çentik sayısı: 1, 2, 3). Pimleri takıp en iyi oturanı seçin; bu parçaları dışa aktarırken sadece onları görünür bırakın." | [03-c-plate-zoom.png](img/03-c-plate-zoom.png) | 40 sözcük, iki iş tek iletide; "çentik" aslında çukur nokta | "Deneme parçası eklendi. 1 nokta = 0,1 mm, 2 nokta = 0,2, 3 nokta = 0,3. Bastıktan sonra en iyi oturanın tolerans düğmesini seçin." + ayrı "Yalnız deneme parçasını indir" düğmesi | Orta |
| W12 | "Bölge parçanın tamamını kaplıyor; kesilecek sınır yok." (iki kez) | [03-fail-cut.png](img/03-fail-cut.png) | çözüm yok | "Bütün parça seçili, kesecek sınır yok. Silgi ile ayrılmayacak kısmı silin ya da Ctrl+Z." | Orta |
| W13 | "Desteklenmeyen dosya türü: .txt" | [03-err-not-a-model-txt.png](img/03-err-not-a-model-txt.png) | desteklenenler yok | ".txt açılamaz. STL, OBJ, 3MF ya da .3dsplit dosyası seçin." | Düşük |
| W14 | Pencere başlığı "YAPIŞTIR — DİKİŞ", altında Tapa metni | [03-seam-fail.png](img/03-seam-fail.png) | başlık ve içerik çelişiyor | Dikiş'te başlık "DİKİŞ — yapıştırmalık" ya da "DİKİŞ — pimli"; Tapa metni gizlenir | Yüksek |
| W15 | Dikiş yardımı "Halka düz değilse … kesim durur ve halka kırmızı çizilir" / ileti "Çizgi düz değil; Kes, çizilen halkayı izler." | Yardım, [03-seam-fail.png](img/03-seam-fail.png) | çelişki; ilettide "Çizgi" aracın adı değil | Yardım: "Halka düz değilse kesim çizilen halkayı izler." İleti: "Halka düz değil; kesim çizdiğiniz yolu izleyecek." | Orta |
| W16 | "Tapa — yüzeysel bölge (yükseklik ~30.2 mm): tapa + yuva" | Bluey "Seçim 3" önerisi (ölçüm `esg.mjs`) | 30 mm "yüzeysel" değil; "tapa + yuva" tekrar | "Öneri: Tapa (bölge 30 mm yüksek). Gövdede yuva açılır." | Düşük |
| W17 | "Pimli kes — kalın çıkıntı (kalınlık ~17.5 mm): düz kesim + pim" | [03-a-tapa-preview.png](img/03-a-tapa-preview.png) | sembol dizisi (":", "+", "~") cümle değil | "Öneri: Pimli kes. Bölge 17,5 mm kalın; düz kesilir, pim konur." | Düşük |
| W18 | İnce ayar: "Gövdede pay %", "Uç pahı", "Duvar", "Sıkıştır %", "Ayak payı", "Kesit şekli" | [03-w-pimli-kes-advanced.png](img/03-w-pimli-kes-advanced.png), [03-w-tapa-advanced.png](img/03-w-tapa-advanced.png) | CAD terimi, birimi anlamı açıklamıyor | "Pimin gövdeye giren kısmı (%)", "Pim ucu eğimi", "Deliğin çevresinde en az et", "Tapayı daralt (%)" | Orta |
| W19 | "Ölçek (oto)", "Yalnız çukur", "Dibe oturt" | Akıllı seç ayarları, [03-empty.png](img/03-empty.png) | ne yaptığı belli değil; "oto" kısaltma | "Ayrıntı boyu (otomatik)", "Çukurda dur", "Sınırı kıvrımın dibine çek" | Orta |
| W20 | "Kopukları ayır", "İncelt", şerit grubu "Mesh" | şerit, [03-empty.png](img/03-empty.png) | jargon | "Ayrık parçaları böl", "Üçgenleri sıklaştır", grup "Model onarımı" | Düşük |
| W21 | "İşlem iptal edildi. Model değişmedi." | Esc ile iptal | iyi örnek; diğer iletiler bu biçimde olmalı | — | — |
| W22 | "Kes 1: Gövde 1, Gövde 2, Gövde 3 ayrıldı (Tapa · Filament 4). Kesilmeden önceki hal Önceki haller'de gizli." | [03-a-cut-done.png](img/03-a-cut-done.png) | iki cümle, "hal Önceki haller'de" yinelemesi | "3 parça ayrıldı (Tapa). Eski hali Önceki haller'de." | Düşük |
| W23 | "Çizgi kapatıldı: 2252 üçgen boyandı." / seçim satırı "2.364 üçgen" | [03-b-line-closed.png](img/03-b-line-closed.png) | iki sayı, iki biçim | tek sayı, binlik noktalı: "Halka kapandı, bölge boyandı (2.364 üçgen)." | Düşük |
| W24 | "0.2 mm", "~17.5 mm" / "0,4", "1,89 milyon" | çeşitli | ondalık ayırıcı karışık | Türkçede ondalık virgül: "0,2 mm" | Düşük |
| W25 | Tolerans plakası dosya adı "Tolerans plakası _0_1 _ 0_2 _ 0_3 mm_.stl" | `parts.zip` içi | ad karakterleri alt çizgiye dönmüş | "tolerans-plakasi-0.1-0.2-0.3mm.stl" | Düşük |

---

## 4. Erişilebilirlik: klavye ve kontrast (accessibility-audit)

### 4.1 Klavye

Yöntem: figür açık, imleç tuvalde; 160 kez Tab, her adımda `document.activeElement`, sınır kutusu, `:focus-visible`, öğe ortasındaki en üst öğe (`elementFromPoint`) kaydedildi. Ayrıca görev (a) yalnız klavyeyle yapıldı; Yardım ve Komut ara pencerelerinde Tab davranışı izlendi.

| # | Bulgu | WCAG | Önem | Kanıt |
| --- | --- | --- | --- | --- |
| K1 | **Boyama, Çizgi, Dikiş ve pim yerleştirme klavyeyle yapılamıyor.** Tuval odak almıyor; bölge seçmenin tek klavye yolu "Çıkıntılar" (otomatik) ya da boyalı 3MF'te hazır seti ağaçtan seçmek. Görev (b) klavyeyle yapılamaz. 3B boyama doğası gereği işaretçi ister, ama Çizgi noktaları ve pim konumu sayısal ya da ok tuşlarıyla verilemiyor. | 2.1.1 (A) | Yüksek | `ek.mjs`: Tab sırasında `canvas` hiç yok |
| K2 | **Görev (a) klavyeyle 242 tuşla tamamlanıyor.** Aç (dosya penceresi açılıyor), ağaçta "Filament 4" (Enter seçer), Tapa, Kes, Dışa aktar (summary, Enter açar), 3MF — Bambu. İndirme oldu. Tuşların çoğu Tab; atlama bağlantısı ya da bölge kısayolu yok. | 2.1.1 karşılanıyor; 2.4.1 (A) atlama yolu yok | Orta | `ek2.mjs` çıktısı |
| K3 | **Kesimden sonra odak kayboluyor.** Kes'e Enter → kesim bitince Kes kapalı olduğu için odak `body`'ye düşüyor; sonraki Tab baştan başlıyor. | 2.4.3 (A) | Orta | `ek2.mjs`: "focus after cut BODY" |
| K4 | **Odak sırası görsel sırayla uyuşmuyor.** DOM sırası: başlık → şerit → Görünüş küpü (14 düğme) → alt gezinme çubuğu → sol Model ağacı → sağ araç penceresi → alt Geçmiş. Ekranda sol panel küpten ve alt çubuktan önce. Küpün 14 düğmesinin 9'u başka öğenin altında (`elementFromPoint` kendisi değil), "Sağ" ve "Sol" 4 px genişliğinde. | 2.4.3 (A), 2.5.8 (AA) | Orta | [03-kb-tab-3.png](img/03-kb-tab-3.png); Tab listesi 0–13 |
| K5 | **Odaklanan öğe yapışkan alt bölümün altında kalıyor.** Araç penceresinde Tolerans "Sıkı / Normal / Gevşek" ve "Deneme parçası üret" odak aldığında kaydırma olmuyor; öğeler Önizleme / İptal / Kes alanının arkasında, tamamen görünmez. | 2.4.11 (AA) | Yüksek | [03-kb-focus-obscured.png](img/03-kb-focus-obscured.png) (odak "Normal"de) |
| K6 | **Yardım penceresi odağı içine almıyor ve tutmuyor.** `?` ile açılınca odak `body`'de; 40 Tab'ın hepsi pencere dışındaki düğmelere gitti (arkadaki şerit, küp, gezinme). Esc kapatıyor. Tuzak yok (2.1.2 karşılanıyor) ama modal düzeni bozuk; `role="dialog"` var, `aria-modal` yok (`src/ui/HelpDialog.tsx:38`). | 2.4.3 (A) | Orta | [03-kb-help.png](img/03-kb-help.png) |
| K7 | **Komut ara odağı alıyor ama Tab dışarı çıkıyor.** Cmd+K giriş alanına odaklanıyor; Tab arkadaki "Aç, Kaydet, Dışa aktar…" düğmelerine gidiyor, liste açık kalıyor. Esc kapatıyor, odak arkadaki son düğmede kalıyor. | 2.4.3 (A) | Düşük | [03-kb-palette.png](img/03-kb-palette.png) |
| K8 | Odak göstergesi tarayıcı varsayılanı (`outline: auto`, `#005FCC` + Chrome'un açık halkası). Örneklenen düğmelerde görünür. Yalnız mavi halka hesaplanırsa: panel `#111317` üstünde 3,11:1, şerit `#18191c` üstünde 2,94:1, ikincil düğme `#3a3c42` üstünde 1,84:1, seçili segment `#2f6fd6` üstünde 1,24:1. Görünürlük Chrome'un ikinci halkasına bağlı. Komut ara girişinde `outline: none` (`src/ui/styles.css:1562`), girişin kendisi odaklı olduğu için gösterge yok. | 2.4.7 (AA) karşılanıyor; 1.4.11 sınırda | Düşük | [03-kb-focus-segment.png](img/03-kb-focus-segment.png), [03-kb-focus-nav.png](img/03-kb-focus-nav.png) |
| K9 | Kısayollar: tek harf (F, B, E, S, G, L, D, P, H, U, X, W, R), Space, Delete, 0–9; 20'si Yardım › Kısayollar'da değiştirilebilir (2.1.4 için değiştirme yolu var). Görünüş için kısayol yok (yalnız Home). | 2.1.4 (A) karşılanıyor | — | [03-help-keys.png](img/03-help-keys.png) |
| K10 | Esc uzun kesimi iptal ediyor (0,8 s). Klavye tuzağı hiçbir yerde görülmedi (Tab her yerde bir sonraki öğeye geçti). | 2.1.2 (A) karşılanıyor | — | `ecan.mjs` |

### 4.2 Kontrast

Yöntem: `getComputedStyle` ile metin rengi, ata zincirindeki ilk opak arka plan (yarı saydamlar karıştırılarak) ve `opacity` alındı; WCAG göreli parlaklık formülüyle oran hesaplandı. Boş ekran ve Bluey açık + Filament 4 + Tapa halleri ölçüldü (74 renk çifti, 20'si eşik altında). Kapalı (`disabled`) düğmeler 1.4.3'ten muaf; ayrıca belirtildi. Ham veri: `scratchpad/s3/contrast-loaded.json`.

**Metin (1.4.3, eşik 4,5:1; 18,66 px kalın / 24 px altı tüm metin küçük sayıldı)**

| # | Metin | Ön plan / arka plan | Oran | Durum | Önem |
| --- | --- | --- | --- | --- | --- |
| C1 | Aktif set siyahken rozet "FİLAMENT 4" | `#111111` / `#000000` | 1,11 | Başarısız | Yüksek |
| C2 | Durum satırı "Set: Filament 4" (set rengiyle yazılıyor) | `#000000` / `#191a1e` | 1,21 | Başarısız | Yüksek |
| C3 | Birincil "Kes" düğmesi (etkin) | `#dddddd` / `#2e9e5b` | 2,51 | Başarısız | Yüksek |
| C4 | Seçili gövde satırında "140 mm", sayılar | `#777777` / `#1b3257` | 2,87 | Başarısız | Orta |
| C5 | Seçili renk satırında üçgen sayısı "12.131" | `#7d8592` / `#204176` | 2,71 | Başarısız | Orta |
| C6 | Seçili gövde altındaki renk satırları "179.129…" | `#7d8592` / `#1b3257` | 3,45 | Başarısız | Orta |
| C7 | Adım şeridinde gelecek adım "Kes", "Aktar" | `#888888` / `#3a3c42` | 3,11 | Başarısız | Orta |
| C8 | Seçili segment "Orta", "Normal", "Varsayılan" | `#dddddd` / `#2f6fd6` | 3,54 | Başarısız | Orta |
| C9 | Dışa aktar menüsü açıklamaları ("Renk başına filament…") | `#888888` / `#2b2d31` | 3,89 | Başarısız | Orta |
| C10 | Başlıkta etkin "Dışa aktar ▾" (boş ekranda) ve şeritte etkin "İncelt", "Baskı boyu" | `#676769` / `#18191c`; `#64666a` / `#18191c` | 3,13; 3,05 | Başarısız (etkin oldukları için muaf değil) | Orta |
| C11 | Set numaraları "0 1 2 3", ağaç okları "▾" | `#777777` / `#111317` | 4,15 | Başarısız | Düşük |
| C12 | Aktif set adı kırmızıyken durum satırı "Seçim 1" | `#e74c3c` / `#1d1f23` | 4,32 | Başarısız | Düşük |
| C13 | Boş ekranda "TAPA — SEÇİM 1" katlanmış başlık | `#4e4f51` / `#111317` | 2,28 | Başarısız | Düşük |
| — | Kapalı Kes, İptal, Pim, Geri/İleri, geçmiş okları | `#74b78f`/`#2e9e5b` 1,45; `#7b7c80`/`#3a3c42` 2,66; `#64666a`/`#18191c` 3,05 | — | Muaf (kapalı) | — |
| — | Gövde ve set satırlarındaki "⋯" | `#111317` / `#111317` | 1,00 | Satır üstüne gelince görünür; klavyeyle odaklanınca da görünmüyorsa sorun (doğrulanamadı) | — |

C1–C2 renk karesine bağlı: set rengi metin rengi olarak kullanılıyor; siyah, lacivert ve koyu renkli 3MF filamentlerinde her zaman başarısız. Görsel: [03-a-tapa-preview.png](img/03-a-tapa-preview.png) (sağ üst rozet ve "Set:" satırı okunmuyor).

**UI bileşenleri (1.4.11, eşik 3:1)**

| # | Bileşen | Renk / komşu | Oran | Durum | Önem |
| --- | --- | --- | --- | --- | --- |
| U1 | Sayı girişi kenarı (Açı, Derinlik) | `#44464d` / `#1d1f23` | 1,75 (dolgu 1,20) | Başarısız | Orta |
| U2 | İkincil düğme ve seçili olmayan segment kenarı (Çevir, Hafif, İptal) | `#4a4d55` / `#111317` | 2,20 (İptal 1,92) | Başarısız | Orta |
| U3 | Set adı metin girişi | kenar = dolgu = `#1b3257` | 1,00 | Başarısız (alanın düzenlenebilir olduğu görünmüyor) | Orta |
| U4 | Adım şeridinde gelecek adım kutusu | `#3a3c42` / `#18191c` 1,59; kenar 2,08 | Başarısız | Düşük |
| U5 | Şeritte aktif araç ile pasif araç farkı | aktif kenar `#2f6fd6` / `#18191c` 3,65 | Geçti | — |
| U6 | Seçili segment dolgusu | `#2f6fd6` / `#111317` 3,86 | Geçti | — |
| U7 | Birincil Kes dolgusu | `#2e9e5b` / `#1f2024` 4,77 | Geçti | — |
| U8 | Seçili gövde çerçevesi (turuncu) | ~8,7 | Geçti | — |
| U9 | Araç penceresi kenarı | `#28292c` / `#101114` 1,29 | Başarısız; pencere sınırı belli değil (yalnız bilgi amaçlı, zorunlu değil) | Düşük |
| U10 | Odak halkası (K8) | 1,24–3,11 | Sınırda | Düşük |

---

## Doğrulanamadı

- **Ekran okuyucu** (VoiceOver/NVDA): kapsam dışı, denenmedi. Onay kutularının erişilebilir adları Playwright `value` ile "on" döndü; etiket ilişkisi ekran okuyucuyla doğrulanmadı.
- **"⋯" menü düğmelerinin klavye odağında görünürlüğü:** hesaplanan renk arka planla aynı (1,00:1); odak aldığında görünür olup olmadığının görseli alınmadı.
- **Deneme parçasının fiziksel uygunluğu ve gerçek baskıda hangi deliğin seçileceği:** baskı yapılmadı.
- **Geri alma sırasında büyük modelde meşgul kartı:** 1,83 s süren geri almada kart görüntüsü yakalanmadı; gösterge olup olmadığı bilinmiyor.
- **Kesimden sonra Bluey gözbebeklerinin yerinde doğru oturup oturmadığı:** [03-a-eyes-after.png](img/03-a-eyes-after.png) görünümde siyah gözbebeği duruyor; tapa geometrisinin ölçüsü bu aşamada ölçülmedi.
- **Bluey'de açılıştan hemen sonra Kes'e basılırsa ne olacağı** (aktif set beyaz gövdenin %35'i, mod Pimli kes): denenmedi.
- **Dar ekran ve %200 yakınlaştırma (1.4.4, 1.4.10):** yalnız 1440 × 900'de denendi.

## Görseller

Bu belgede kullanılan bütün görseller `docs/review/img/03-*.png`.
