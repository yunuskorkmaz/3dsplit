# Arayüz turu: slicer ve CAD gibi görünsün

20 Ekim 2026. Sprint 8 (X77–X83) girdisi. Kaynak: Chrome'da Bluey_Color.3mf, Grogu_Bambu_Colour.3mf, figure.stl ile yapılan inceleme. Kullanıcı yedi maddenin hepsini istedi. Her madde, ekran davranışı onaylanmadan kodlanmaz.

Sıra: X77, X79, X81, X80, X78, X82, X83. Önce modelin ne gösterdiği (renk, seçim, gezinme), sonra kolaylıklar.

## X77 Renkler tam görünür

Bugün: seçili olmayan renkler %78 griye çekiliyor (X57). Seçili renk beyazsa çok renkli 3MF tamamen gri görünüyor.

Olacak:

- Bütün renkler tam doygunlukta, slicer'daki gibi. Taban gri kalır.
- Seçili renk, sınırındaki çizgiyle öne çıkar: çizgi kalınlaşır ve rengin zıddı (açık renkte koyu, koyu renkte açık) olur. Diğer renklerin sınırı ince ve soluk.
- Renkler panelinde "Seçili rengi öne çıkar" kutusu (varsayılan kapalı): açılınca bugünkü soluk görünüm geri gelir.

Kabul: Bluey_Color.3mf açılınca mavi gövde, turuncu ve siyah bölgeler görünür. e2e: seçili olmayan slot üçgeninin rengi slot rengiyle aynı.

## X78 Tapa ve Yapıştır'da da canlı önizleme

Bugün: yalnız Pimli kes'te kendiliğinden; Tapa ve Yapıştır'da Space gerekiyor.

Olacak:

- Üç modda da boya bitince 300 ms sonra önizleme açılır (X74 ile aynı kurallar: Space kapatır, sonraki boyada yeniden açılır).
- Sabit üçgen sınırı yok; önizlemenin süresi ölçülür. Bir parçada son önizleme 1,5 saniyeyi geçtiyse o parçada canlı önizleme kapanır, panelde "Bu model büyük: önizleme için Space" yazar. Space ile açılan önizleme yine çalışır. Parça değişince (kesim, onarım, ölçek) ölçüm sıfırlanır.

Kabul: figure.stl'de burun Tapa ile, Space'siz önizleme görünür. Önizlemesi 1,5 s'yi geçen modelde ikinci boyada önizleme kendiliğinden açılmaz, yazı görünür.

## X79 Seçili parça belirgin, ilk tık yalnız seçer

Bugün: seçili parça yalnız hafif aydınlanıyor. Başka parçaya tıklamak onu seçip hemen boyuyor.

Olacak:

- Seçili parçanın dış çizgisi turuncu (ekranda 2 px). Fare üstündeki parçanın çizgisi ince ve açık.
- Seçili olmayan parçaya tıklamak yalnız onu seçer: boyamaz, pin koymaz, çizgi başlatmaz. Seçili parçada araç bugünkü gibi çalışır. Tek parça varsa zaten seçilidir, değişen bir şey olmaz.
- Parçalar listesinde seçili satır turuncu kenarlı (görünüm ile liste aynı renk).

Kabul: Grogu'da gövdeye tıklamak gövdeyi seçer, boya değişmez; ikinci tık boyar.

## X80 Çok parçalı dosya

Bugün: 12 parçalı Grogu'da son yüklenen 4 mm'lik tırnak seçili kalıyor. Plakaya dağıtılmış parçaların toplamı 402 mm sayılıp "birimi inç olabilir" uyarısı çıkıyor. Adlar dar listede kesiliyor.

Olacak:

- Açılışta en büyük parça (hacim) seçilir.
- Ölçü uyarısı parça başına: herhangi bir parça 250 mm'den büyük ya da 8 mm'den küçükse o parçanın satırı sarı. Model satırının üstündeki uyarı, en büyük parçanın boyuna bakar. "Baskı boyu" yine bütün parçaları birlikte ölçekler ve en büyük parçayı hedef boya getirir.
- Sol panel daha geniş; ad kesilirse üstüne gelince tam ad görünür. Dosya uzantısı (".stl") adda gösterilmez.

Kabul: Grogu açılınca baş seçili, sarı uyarı yok.

## X81 Gezinme: imlece yakınlaştır, seçili parça etrafında dön

Bugün: kamera sabit merkez etrafında dönüyor, tekerlek ekran ortasına yakınlaştırıyor.

Olacak:

- Tekerlek imlecin altındaki noktaya doğru yakınlaştırır.
- Dönüş merkezi seçili parçanın kutusunun ortası. Parça değişince kamera zıplamaz, yalnız merkez kayar.
- Parçaya çift tık: o parçayı sığdırır ve merkezi ona alır. Boşluğa çift tık: hepsini sığdırır (bugünkü gibi).
  - Uygulamada: seçili parçada ilk tık aracı çalıştırdığı için (boyar) çift tık yalnız seçili olmayan parçada sığdırır. Seçili parçayı sığdırmak için Alt + çift tık.
- Kamera düzeni (varsayılan/Blender) ve ters yakınlaştırma korunur.

Kabul: e2e: tekerlek imleç köşedeyken o köşedeki nokta ekranda yerinde kalır (±10 px).

## X82 Baskı tablası

Olacak:

- Modelin altında, en düşük noktasının hizasında 256 × 256 mm tabla: 10 mm'de bir ince, 50 mm'de bir kalın çizgi. Ortası modelin ortasının altında.
- Model tablaya sığmıyorsa tabla kenarı sarı.
- Kamera panelinde "Tabla" kutusu (varsayılan açık; tarayıcıda hatırlanır).
- Tabla tıklanamaz, seçime ve boyamaya karışmaz.

Kabul: 34 mm'lik model tablada küçük görünür; 402 mm'lik plakada kenar sarı.

## X83 Yeni kullanıcı: örnek model ve adım çubuğu

Olacak:

- Boş ekranda "Aç" yanında "Örnek modeli aç": figür tarayıcıda üretilir (dosya yok, `samples/make-figure.mjs` ile aynı biçim).
- Üst şeritte adım çubuğu: **Aç → Seç → Kes → Aktar**. Bulunulan adım vurgulu, geçilenler işaretli:
  - parça yok: Aç,
  - parça var, boya yok: Seç,
  - boya var: Kes,
  - kesimden yeni parça var: Aktar.
  Adıma tıklamak o adımın düğmesini gösterir (Aç: dosya penceresi, Aktar: Dışa aktar menüsü).
- Model yokken Renkler ve Kesim panelleri soluk ve kapalı; yalnız Parçalar paneli ve boş ekran yazısı görünür.

Kabul: e2e: boş ekran → Örnek modeli aç → adım "Seç" → boya → "Kes" → kes → "Aktar".

# Sprint 9: araç kullanımı CAD programı gibi

21 Ekim 2026. Kaynak: SolidCraft web sürümü (docs.solidcraft.io/app, v0.18.2) Chrome'da denendi, Fillet aracı kullanıldı. Kullanıcı hepsini istedi ve sol tarafta gövdeler ile renk seçimlerinin ağaç olarak görünmesini ekledi. Her madde, ekran davranışı onaylanmadan kodlanmaz.

SolidCraft'ta görülen düzen: üstte simgeli ve gruplu şerit; solda "Browser" ağacı (gözlü satırlar, klasörler); araca basınca sağda başlıklı pencere (seçim alanı, ayar satırları, Preview kutusu, katlanır Advanced, Cancel / OK); değer modelin üstünde imleç yanında da girilir; altta simgeli geçmiş şeridi; alt ortada gezinme düğmeleri; sağ üstte komut arama.

Bizdeki fark: SolidCraft'ta her araç işi bitince kapanır. Bizde boyama araçları sürekli açık kalır, asıl "komut" kesimdir. Bu yüzden İptal / Kes yalnız kesimde vardır.

Sıra: X84, X85, X86, X87, X88, X89, X90.

Kararlar (kullanıcı kararı bana bıraktı, 21 Ekim 2026):

- İptal boyayı silmez: önizlemeyi kapatır, Akıllı seç'e döner. Boyayı silmek seçim satırındaki × ile; Ctrl+Z geri getirir. Neden: yanlışlıkla basılan İptal emeği silmemeli.
- Komut arama Ctrl+K (Mac'te Cmd+K). S Yumuşat'ta kalır; tek harfli araç kısayolları değişmez.
- Mesh araçları, Kamera ve Geçmiş panelleri kalkar; içerikleri şeride, gezinme çubuğuna ve alt şeride taşınır. Aynı iş iki yerde durmaz.
- Simgeler kendi çizdiğimiz satır içi SVG (24 × 24, 1,75 px çizgi, `currentColor`). Tapa ve pim gibi bize özgü simgeler hiçbir kütüphanede yok; tek elden çizilince hepsi aynı görünür, bağımlılık eklenmez.

Hedef yerleşim:

```
┌ 3dsplit  Dosya ▾  ↶ ↷ │ Aç → Seç → Kes → Aktar │            [ Komut ara  Ctrl+K ] ? ┐
├ [✦]  [●]  [◌]  [≈]  [▣]  [✎]  [⌇] │ [▲]  [⊕]  [▬] │ [⧉]  [✚]  [▦] │ [⤢]  [⇔]  [◐] ┤
│ Akıllı Fırça Silgi Yum. Kova Çizgi Dikiş│Tapa Pimli Yapış│ Böl  Onar Üçgen│Boy Aralık Saydam│
│              Seç                     │     Kes       │    Mesh       │    Düzen      │
├──────────────┬───────────────────────────────────────────────┬─────────────────────┤
│ Model        │                                     [küp]     │ ▲ Tapa          ×   │
│ ▾ figure ... │                                               │ Seçim  ■ Renk 1 ×   │
│  ▾ Gövdeler  │                                               │ Derinlik  [3 mm]    │
│   👁 figure  │               (model)                         │ Tolerans  Sıkı|Norm │
│     ■ Renk 1 │                     ┌──────┐                  │ ☑ Önizleme          │
│     ■ Renk 2 │                     │ 3 mm │                  │ › İnce ayar         │
│  ▾ Renkler   │                                               │      [İptal] [Kes]  │
│   ■ Taban    │                                               │                     │
│   ■ Renk 1   │        [⟳][✥][⌕][⤢][⌂][▣▾][⚙]                 │                     │
│  › Kaynaklar │                                               │                     │
├──────────────┴───────────────────────────────────────────────┴─────────────────────┤
│ Geçmiş  |◀ ◀ ▶ ▶|   [◻][●][●][▲][⊕] ┃                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## X84 Simgeli şerit

Bugün: üstte yalnız yazılı düğmeler (Seç / Kes), altında seçili aracın ayar satırı. Mesh araçları, Baskı boyu, Aralıklı ve Saydam başka yerlerde.

Olacak:

- Her düğmede üstte simge (24 px, kendi çizdiğimiz satır içi SVG; kütüphane eklenmez), altında ad. Grup adı düğmelerin altında: **Seç** (Akıllı seç, Fırça, Silgi, Yumuşat, Kova, Çizgi, Dikiş), **Kes** (Tapa, Pimli kes, Yapıştır, Pim), **Mesh** (Kopukları böl, Onar, Üçgenleri böl, Çıkıntıları öner), **Düzen** (Baskı boyu, Aralıklı, Saydam).
- Seçili araç mavi zeminli. Üstüne gelince ad, kısayol ve ipucu.
- Mesh araçları paneli kalkar. "Aralıklı" ve "Saydam" üst çubuktan şeride iner. Baskı boyu düğmesi küçük bir açılır kutu gösterir (bugünkü alan + Ölçekle).
- Dar ekranda (< 1100 px) adlar gizlenir, yalnız simge kalır.
- Uygulamada: Çıkıntıları öner boyadığı için Mesh'e değil Seç grubuna kondu ("Çıkıntılar"). Ayrıklık alanı Aralıklı açıkken Parçalar panelinde kalır.

Kabul: e2e: bütün araçlar şeritten seçilir; Mesh paneli yok; bugünkü testler şerit düğmelerinin erişilebilir adıyla geçer.

## X85 Sol ağaç: gövdeler ve renkler

Bugün: solda ayrı Parçalar ve Renkler panelleri.

Olacak: tek "Model" paneli, ağaç biçiminde:

- **Gövdeler (N)**: her parça bir satır: göz (gizle/göster, Alt+tık yalnız bu), ad, ölçü (sarı uyarı korunur), rozetler (yeni, açık mesh). Satıra tık parçayı seçer (turuncu kenar korunur).
  - Parçanın altında, o parçada boyası olan renkler: renk karesi, ad, üçgen sayısı. Renk satırına tık: parçayı ve o rengi seçer. Gözü o rengin boyasını geçici gizler (yalnız görüntü).
- **Renkler**: bugünkü renk listesi (Taban dahil): kare (renk seç), ad (çift tıkla düzenle), kısayol numarası. Temizle ve Kaldır satırın üstüne gelince çıkan simgeler ve sağ tık menüsünde. Sonda "+ Renk". "Seçili rengi öne çıkar" kutusu klasör başlığındaki menüye taşınır.
- **Kaynaklar**: kesimden önceki gizli parçalar ayrı, kapalı klasörde (bugün listede sarı rozetle duruyor).
- Sağ tık menüsü: parçada Göster/Gizle, Yalnız bu, Sığdır, Sil; renkte Temizle, Kaldır, Bu renkle seçili parçada Kes.
- Panel başlığında gövde sayısı ("3 gövde"), SolidCraft'taki gibi.

Uygulamada:

- Renk boyasını gizleyen göz parça altındaki satırda değil, Renkler'deki satırda (bütün parçalarda gizler). Parça altındaki satır yalnız seçer.
- Parça satırındaki "Tek" ve × düğmeleri kalktı; ⋯ düğmesi ve sağ tık menüsü (Gizle/Göster, Yalnız bunu göster, Sığdır, Sil). Alt + göz yine yalnız o parçayı gösterir.
- Renk satırında temizle ve kaldır yalnız ⋯ / sağ tık menüsünde. "Seçili rengi öne çıkar" kutusu Renkler klasörünün altında kaldı. "Bu renkle kes" menüsü eklenmedi: kesim sağdaki pencereden.
- Sol panel 290 px.

Kabul: e2e: figure aç → Akıllı seç ile boya → ağaçta figure altında "Renk 1" satırı çıkar; ona tık aktif rengi değiştirir; Bluey'de Gövdeler altında renkleri sayılır; kesimden sonra eski parça Kaynaklar'da.

## X86 Araç penceresi

Bugün: boyama aracının ayarları şeridin altında yatay satırda; kesim ayarları sağda sürekli açık panelde.

Olacak: sağda tek pencere, başlığı aktif araç ya da kesim modu, simgesiyle.

- **Boyama aracı seçiliyken**: ayarlar alt alta etiketli satırlar (Akıllı seç: Açı, Ölçek, Yalnız çukur, Dibe oturt, Ayna; Fırça: Çap…). İpucu metni en altta. İptal / OK yok.
- **Boya varken pencerenin altında kesim bölümü** açılır (bugünkü Kesim paneli), sırası:
  1. Seçim satırı: renk karesi, "Renk 1 · figure · 1.240 üçgen", × (o boyayı temizler, Ctrl+Z geri getirir).
  2. Mod düğmeleri (Tapa / Pimli kes / Yapıştır; şeritle aynı).
  3. Mod ayarları (Derinlik, Gidiş, Pim, Tolerans).
  4. "Önizleme" kutusu (Space ile aynı; X78 kuralları korunur). Önizleme düğmesi kalkar.
  5. Katlanır "İnce ayar" (bugünkü gibi).
  6. Altta **İptal** ve **Kes** (mavi). İptal önizlemeyi kapatır ve Akıllı seç'e döner; boya silinmez.
- Şeritte Tapa / Pimli kes / Yapıştır'a basınca pencere kesim bölümüne kayar; boya yoksa "Önce bir bölge boyayın" yazar ve Kes kapalıdır.
- Pencere başlığından katlanabilir; × yok (her zaman bir araç seçili).

Uygulamada:

- Pencerede mod düğmeleri yok: mod şeritten seçilir, başlıkta yazar ("Tapa — Renk 1"). Aynı düğme iki yerde olunca hangisinin seçili olduğu karışıyordu.
- Önizleme kutusu, İnce ayar'ın altında değil pencerenin altındaki sabit bölümde, İptal / Kes'in üstünde: uzun ayar listesinde de görünür kalır.
- Kes düğmesi yeşil kaldı (bugünkü renk).
- Şerit altındaki ayar satırı kalktı; paneller üstten 10 px başlar. Sağ pencere 280 px.

Kabul: e2e: Akıllı seç ayarları pencerede; boya sonrası seçim satırı ve Kes görünür; × boyayı siler, Ctrl+Z geri getirir; İptal önizlemeyi kapatır, boya kalır.

## X87 Gezinme çubuğu

Bugün: görünüş küpünün altında "Sığdır"; kamera ayarları sol paneldeki Kamera bölümünde.

Olacak:

- Alt ortada simgeli çubuk: Döndür, Kaydır, Yakınlaştır (sol tuş bu kipe geçer; Esc ya da araç seçimi bırakır), Hepsini sığdır, Seçiliyi sığdır, Ev (başlangıç bakışı), Görünüşler ▾ (Ön, Arka, Sağ, Sol, Üst, Alt, Eğik), Tabla, ⚙ (Kamera düzeni, Ters yakınlaştırma).
- Kamera paneli kalkar. Görünüş küpü yerinde kalır, altındaki "Sığdır" kalkar.

Uygulamada: "Hepsini sığdır" bakış yönünü korur; "Ev" bugünkü Sığdır gibi önden bakıp hepsini sığdırır (Home tuşu). Kip düğmesine ikinci kez basmak da kipi bitirir.

Kabul: e2e: Seçiliyi sığdır parçayı ortalar; ⚙'dan Blender düzeni seçilir ve hatırlanır; Tabla düğmesi tablayı gizler.

## X88 Geçmiş şeridi

Bugün: sol altta katlanmış "Geçmiş" paneli, adımlar yazıyla.

Olacak:

- En altta, tam genişlikte ince şerit: solda "Geçmiş" ve |◀ ◀ ▶ ▶| (başa, geri, ileri, sona). Sağında her adım bir simge: boya, sil, yumuşat, kes, pim, onar, ölçek, renk. Simgenin rengi adım bir renge aitse o renk.
- Bulunulan adımdan sonra mavi çizgi; geri alınmış adımlar soluk. Simgeye tık o adıma gider (bugünkü `jumpToHistory`). Üstüne gelince adım adı.
- Çok adımda şerit yana kayar, son adım hep görünür.
- Geçmiş paneli kalkar.

Kabul: e2e: iki boya + kes → 3 simge; ilk simgeye tık sonrası ikisi soluk; ▶| hepsini yineler.

## X89 Değer model üstünde

Olacak:

- **Tapa**: önizlemede yön okunun ucunda küçük "3 mm" kutusu; tıklayınca yazılır, Enter uygular (pencerede Derinlik ile aynı değer).
- **Pimli kes**: seçili pimin yanında "Ø 3 · 12 mm" kutusu; tıklayınca çap ve boy yazılır.
- **Fırça, Silgi, Yumuşat**: [ ve ] ile çap değişince imleç yanında 1 s "Ø 4 mm" görünür.
- Kutular modelle birlikte döner, modelin arkasına geçince gizlenir.

Uygulamada: derinlik kutusu okun dibinde, yüzeyin biraz dışında (ucu gövdenin içinde kalıyor). Pim kutusu örtülme denetlemez: pim modelin içinde ama üstte çizilir. Pim kutusunda çap (Ø) gösterilir, alan yarıçapı yazar.

Kabul: e2e: figure burun Tapa önizlemesinde kutu görünür; 5 yazıp Enter → cut.depth 5, önizleme yenilenir.

## X90 Komut arama

Olacak:

- Sağ üstte "Komut ara" kutusu, kısayol **Ctrl+K** (S Yumuşat'ta, / tarayıcıda hızlı bulmada).
- Açılınca bütün komutlar: araçlar, kesim modları, Mesh ve Düzen işleri, Dışa aktar, Kaydet, Aç, görünüşler, yardım. Her satırda simge, ad, kısayol.
- Yazdıkça süzülür (Türkçe harf ve aksan duyarsız: "yapistir" → Yapıştır). ↑ ↓ seçer, Enter çalıştırır, Esc kapatır. Son kullanılan 5 komut boşken en üstte.
- O an çalışmayan komut soluk ve nedeni yanında ("parça yok").

Kabul: e2e: Ctrl+K → "pimli" → Enter → kesim modu keys.

# Sprint 10: kararlılık, büyük model, anlaşılır işlem, gövde ve seçim seti

22 Ekim 2026. Kullanıcı isteği: tarayıcı yenilenince kaldığı yerden devam; büyük modellerde çalışma; ne yaptığını anlayabilme; Fusion 360 / SolidCraft gibi ayrılan parçanın yeni gövde, renkli seçimlerin seçim seti olması; kesim yüzeyinin daha pürüzsüz olması. Kullanıcı kararları önceki turlarda bana bıraktı; kararlar aşağıda gerekçesiyle.

Bugün görülenler (testa kulağı, Tapa ve Pimli kes, Chrome):

- Kesimden sonra yeni parça seçimin etiketini taşıyor; canlı önizleme hemen o parçada açılıp kırmızı "Bölge parçanın tamamını kaplıyor" hatası veriyor.
- Pimli kes yüzü düz ve temiz. Tapa yuvasının duvarında ince gölge çizgileri ve kenarda hafif dalga var: kapak merkezden yelpazeyle örülüyor, ince uzun üçgenler gölgede çizgi bırakıyor.
- Yenilemede her şey gidiyor; yalnız elle kaydedilen `.3dsplit` var.

Sıra: X95, X96, X97, X98, X99, X100.

## X95 Oturum kurtarma

- Her değişiklikten (geçmişe giren her adım, renk/ad değişikliği) 1,5 s sonra oturum tarayıcının IndexedDB'sine yazılır: parçalar (mesh + etiket), seçim setleri, seçili parça, aktif set, kesim ayarları. Geri alma geçmişi yazılmaz (büyük); kurtarılan oturum tek "Kurtarıldı" adımıyla başlar.
- Yazma Worker'da değil ana thread'de ama tipli diziler kopyalanmadan (structured clone) verilir; yazma sürerken yeni değişiklik gelirse bir sonraki tura kalır.
- Sayfa açılınca kayıtlı oturum varsa boş ekranda kart: "**testa** — 2 gövde, 14:32'de kaydedildi. [Devam et] [Yok say]". Yok say kaydı siler. Model açık değilken kart görünür; dosya açılırsa kart kalkar, eski kayıt yenisiyle değişir.
- Üst çubukta kayıt durumu: "Kaydedildi 14:32" / "Kaydediliyor…". Yazma hatası (kota) uyarı verir, uygulama çalışmaya devam eder.

Uygulamada: kurtarılan oturumun geçmişi boş başlar ("Kurtarıldı" adımı eklenmedi; geri alınacak bir şey yok). Pimler ve kesim ayarları da saklanır.

Kabul: e2e: figure aç, boya, kes → sayfayı yenile → kart → Devam et → 2 gövde ve boya aynı.

## X96 Büyük model

Önce ölçülür, sonra en yavaş iki adım düzeltilir. Ölçüm modeli: BLUEY+SENTADA (1,47M üçgen) ve Bluey_Color.3mf (500k).

- Her ağır adım (aç, Akıllı seç, önizleme, kes, dışa aktar) için süre ve bellek tabloya yazılır (`docs/ROADMAP.md` günlüğü).
- 1M üçgeni aşan modelde açılışta seçenek: "Bu model 1,47M üçgen. Önerilen: 400k'ya sadeleştir (ayrıntı korunur, işlemler hızlanır). [Sadeleştir] [Olduğu gibi aç]". Sadeleştirme manifold `simplify` ile, sapma ortalama kenarın yarısı kadar.
- Worker'daki 120 s sınırı büyük modelde üçgen sayısıyla büyür (kesim takılmasın).

Uygulamada: hedef 400 bin; tolerans ortalama kenarın %1'inden başlayıp ikiye katlanır, hedefin altına inen ilk sonuç alınır (ilk denemede %25'ten başlamak 45 bine iniyordu). Komut aramada "Sadeleştir" seçili parçayı yarıya indirir. Gizli kaynak parçalar sahneye konmaz (GPU'da kopya tutulmaz), gösterilince kurulur.

Kabul: BLUEY+SENTADA aç → sadeleştir → Akıllı seç → Pimli kes → 3MF; her adımın süresi günlükte.

## X97 Ne olduğu görünür

- **Meşgul kartı:** ağır işte adım adım ilerleme: "Kesiliyor · 2/4 tapa hacmi · 6 s · [İptal]". Worker aşama adlarını gönderir (kenar düzeltme, hacim, boolean, parçalar).
- **İşlem adları:** geçmiş adımları ne yapıldığını ve sonucunu söyler: "Kes 1 · Tapa · Seçim 1 → Gövde 2, Gövde 3", "Akıllı seç · Seçim 1 · 1.240 üçgen". Şeritte simgenin üstüne gelince bu ad.
- **Kesimden sonra hata yok:** kesilen parçanın seçimi gövdeye dönüşür (X98), önizleme o parçada açılmaz.
- **Durum satırı:** araç penceresinin başlığının altında tek satır: "Akıllı seç → Seçim 1 · gövde: testa · bir çıkıntıya tıkla".

Uygulamada: aşamalar yalnız kesimde (seçim bölgeleri, kenar düzeltme, model kurulumu, tapa ve yuva hacmi / kesim yüzü, pimler, gövdeler); diğer ağır işlerde (açma, sadeleştirme, önizleme) kart iş adı ve süreyi gösterir. Durum satırı aracın ipucunu da taşır (eski alt ipucu kalktı). Kesimden sonra öneri hemen silinir.

Kabul: e2e: kes → geçmiş adı "Kes 1 · Tapa · Seçim 1 → …", kırmızı önizleme hatası yok; büyük kesimde meşgul kartı aşama gösterir.

## X98 Gövdeler (Fusion gibi)

- Kesimden çıkan her parça yeni gövdedir: adı "Gövde N" (N sırayla), kesilen seçim setinin rengini gövde rengi olarak alır, üstündeki seçim boyası temizlenir (seçim kesilince tüketilmiş olur). Kalan gövde de yeni ad alır, rengi değişmez.
- Ağaçta gövde satırının altında küçük yazı: "Kes 1'den". Gövdenin rengi satırın başında kare.
- Ağaçta yeni klasör **İşlemler**: Aç, Kes 1, Onar… sırayla; işleme tıklayınca ondan çıkan gövdeler seçilir ve görünür olur. Kaynaklar klasörü "Önceki haller" olur.
- Gövdeye yeniden ad verilebilir (çift tık). 3MF'te parça adı gövde adıdır.

Uygulamada: kalan gövde adını korur (Fusion'da Split Body gibi; "testa" kesilince "testa" kalır), ayrılan parça "Gövde N" olur (N 1'den). X97'deki "kesimden sonra hata yok" bununla geldi: ayrılan gövdede seçim kalmadığı için önizleme açılmıyor. Sıra X98 → X97 oldu. İşlemler'e tıklayınca gizli gövde gösterilir ve son ayrılan gövde seçilir.

Kabul: e2e: figure burnu kes → "Gövde 1" (Seçim 1 rengi, boyası yok) ve "figure" (kalan); İşlemler'de "Kes 1"; tıklayınca Gövde 1 seçilir.

## X99 Seçim setleri

- "Renkler" klasörü **Seçim setleri** olur. Her set: renk, ad ("Seçim 1"), kısayol, kaç gövdede kaç üçgen. Taban ayrı satır: "Seçimsiz (gövde rengi)".
- Boyamak aktif sete eklemektir; Shift ile setten çıkarmak. Setin ⋯ menüsü: Yeniden adlandır, Seçili gövdede temizle, Bütün gövdelerde temizle, Kaldır, Bu seti kes.
- Arayüz metinlerinde "renk/slot" yerine "seçim seti" (araç penceresi, seçim satırı, yardım, komut arama). 3MF'te set rengi filament rengidir; bu, set satırının ipucunda yazar.

Uygulamada: "Bütün gövdelerde temizle" eklenmedi ("Seti kaldır" bütün gövdelerden siler, Ctrl+Z geri getirir). Taban satırı adını korur, ipucunda "seçimsiz yüzey" yazar. Kullanım sayısı satırda "1 gövde · 1.240" ya da "boş". 3MF'ten gelen setlerin adı "Filament N" kalır.

Kabul: e2e: iki set boya → set satırlarında gövde/üçgen sayısı; "Bu seti kes" kesimi başlatır; metinlerde "Renk 1" kalmaz (yeni set adı "Seçim 1").

## X100 Pürüzsüz kesim yüzeyi

- Kapak yelpaze yerine düzgün üçgenlenir: sınır eşit aralıkla örneklenir, içine ızgara noktaları konur, kısıtlı Delaunay ile örülür. Gölgede çizgi kalmaz, tapa ve yuva duvarı aynı sıklıkta.
- "Kenarı düzelt" üç düzeyli olur: Hafif / Orta (varsayılan, bugünkü) / Güçlü. Güçlüde sınır eğrisi daha geniş Gauss ile yumuşatılır; alan dengesi korunur.
- Yumuşat aracında "Tüm sınırı yumuşat" aynı düzeyi kullanır.

Uygulamada: kısıtlı Delaunay yerine halkadan örülen kapağın iç kenarları ortadan bölünür (hedef kenar: halkanın ortalama kenarı, ama kapak boyunca en çok ~40 üçgen), Delaunay çevirmesi uygulanır, iç yükseklikler Laplace ile dağılır (`src/core/capRefine.ts`). Kullanıldığı yerler: Pimli kes / Yapıştır kapağı (`capSplit`) ve Tapa kapak prizması (`capPlugVolumes`). Yuva tabanında tolerans payı yolundan gelen hafif yelpaze izi X101 ile kalktı. "Tüm sınırı yumuşat" kendi gücünü kullanmaya devam ediyor.

Kabul: test/: kapak üçgenlerinin en küçük açısı ≥ 20°; e2e: testa kulağı Tapa yuvası ekran görüntüsü günlükte (önce/sonra).

# Sprint 12: güven — iş kaybı ve yanlış kesim

Kaynak: `docs/review/00-ozet.md`, `docs/review/02b-audit-ux.md`. Davranışlar 2026-10-28'de onaylandı (ROADMAP "Review planı").

## X102 Geri al modeli kaldırmaz

- Boş sahneye açılan dosya geçmişin tabanıdır: geçmişe adım olarak girmez, geri al/yinele yığınları boşalır. Geçmiş şeridinde "Başlangıç" açılmış modeldir.
- Model açıkken açılan ikinci dosya tek adımdır ("Aç: ad" ya da "Aç: ad ve N parça"); geri alınca yalnız o dosyanın parçaları gider.
- Sahne boşalınca (ör. bütün gövdeler silinince) otomatik kayıt eski kaydı silmez; yenileyince son dolu hal "Devam et" ile gelir. Kaydı yalnız "Yok say" siler (X106 bunu ayrıca ele alır).
- Çizgi ya da Dikiş'te yarım halka varken Cmd/Ctrl+Z son noktayı siler (Backspace gibi); halka yokken her zamanki geri al.

Kabul: e2e `undo-base.spec.ts`: açılıştan sonra geçmiş boş ve Cmd+Z modeli kaldırmaz; yarım çizgide Cmd+Z bir nokta siler; Başlangıç'ta model yerinde; gövde silinip sahne boşalınca yenilemede "Devam et" gelir; dolu sahneye ikinci dosya tek adımda geri alınır.
