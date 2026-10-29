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

## X103 Eski öneriyle kesim olmaz

- Set, boya, seçili gövde ya da gövde listesi değişince eski öneri aynı anda kalkar; yerine "Öneri hesaplanıyor…" görünür.
- Mod öneriyi izliyorsa (elle seçilmediyse) öneri gelene kadar Kes kapalıdır; ipucu "Kesim modu belirleniyor; öneri gelince açılır". Mod elle seçildiyse Kes beklemez. Dikiş'te öneri kullanılmaz, Kes beklemez.
- Kes başka yoldan (set menüsünde "Bu seti kes", komut arama) çağrılırsa ve öneri o bölge için gelmemişse kesimden önce beklenir ("Kesim modu belirleniyor…" meşgul kartı). Bu bekleme İptal edilirse kesim yapılmaz.
- Kesim iletisindeki mod, kesimin yapıldığı moddur; artık eski öneriyle başka modda kesim olmadığı için şeritle çelişmez.

Uygulamada: öneri tetiklemesi React effect'inden store aboneliğine taşındı (`startSuggestionWatch`); effect bir kare geç kalıyor, o karede eski öneri ve açık Kes görünüyordu. Bluey'de (500 bin üçgen) Filament 4'e geçince Kes ~10 s kapalı kalıyor; bu, doğru modla kesmenin bedeli.

Kabul: e2e `stale-suggestion.spec.ts`: kol (Pimli kes) ve burun (Tapa) setleri arasında geçişte eski öneri hemen kalkar, bekleme kartı görünür ve o sırada Kes hiç açılmaz; set değiştirilip hemen kesilince kesim yeni setin önerisiyle (Tapa) yapılır. Chrome'da Bluey: Filament 4 seçilip Kes'e basılınca kesim Tapa ile.

## X104 Boyalı 3MF'te kesime hazır renk gelmez

- Boyalı 3MF açılınca aktif set Taban, araç Akıllı seç. Kes kapalı, adım şeridi "Seç"te; durum satırı "Ayıracağın renge tıkla: o set seçilir.", seçim satırı "Renk seçilmedi: ayıracağın renge tıkla ya da bir seçim seti seç."
- Taban aktifken Akıllı seç ile tıklama boyamaz (eskiden boyayı silerdi): boyalı bölgeye tık o bölgenin setini aktif yapar, boyasız yere tık "Ayıracağın renge tıkla ya da bir seçim seti seç." der. Shift+tık (sil) ve diğer araçlar değişmez. Bu kural yalnız 3MF açılışında değil, Taban her aktif olduğunda geçerli (2026-10-28'de seçildi).
- 3MF'ten gelen setlerin hepsi "Filament N" adını alır; varsayılan "Seçim N" adı da değişir, kullanıcının verdiği ad korunur. Açılış iletisi: "Boyalı 3MF: N filament rengi seçim seti olarak geldi. Ayıracağın renge tıkla."
- Adım şeridi "Kes"e ancak aktif setin seçili gövdede boyası varken geçer; başka setlerin boyası (3MF'teki renkler) geçirmez.

Kabul: e2e `painted-open.spec.ts` (Bluey): açılışta aktif set Taban, setler Filament 1–5, Kes kapalı, adım "Seç"; göz bebeğine tık boyamadan Filament 4'ü seçer (boya sayısı ve geçmiş değişmez), adım "Kes", Kes açılır.

## X105 Pimler bölgeye ait, kesimi geri almak ayarları getirir

- Elle konan pimler seçili gövde + aktif set bölgesine aittir. Başka sete ya da gövdeye geçince pimler o bölgede bekler, panelde görünmez ve başka bölgenin kesimine taşınmaz; geri dönünce yerinde gelir.
- Pim değişikliğini (ekle, sil, taşı) geri almak o pimin bölgesine döner: başka setteyken Ctrl+Z, pimin setini ve gövdesini seçip değişikliği geri alır.
- Kesimi geri almak kesilen bölgeyi tümüyle geri getirir: gövde, aktif set, elle konan pimler, Tapa yönü, bölge derinlikleri, kesit profili. Yinele bunları yine kesimdeki gibi sıfırlar.

Uygulamada: bekleyen pimler bellekte gövdenin mesh'ine bağlı tutulur (`WeakMap`); ölçek, sadeleştirme ya da proje açma mesh'i değiştirince eski pimler düşer. Oturum kaydı yalnız aktif bölgenin pimlerini saklar; başka bölgede bekleyen pimler sayfa yenilenince gider. Tapa yönü ve bölge derinlikleri bölgeye bağlanmadı (onaylanan kapsam yalnız pimler); kesimde sıfırlanıp geri alınca dönerler.

Kabul: e2e `region-pins.spec.ts`: Seçim 1'e iki pim; Seçim 2'de pim yok, Seçim 1'e dönünce iki pim; Seçim 2'deyken Ctrl+Z Seçim 1'e döner ve bir pim kalır; kesimden sonra Ctrl+Z aynı gövde, aynı set, iki pim; yinele pimleri sıfırlar.

## X106 Kayıtlı oturum sormadan silinmez

- "Yok say" yalnız kartı kapatır; kayıt silinmez, yenileyince kart yine gelir. İpucu: "Kayıt silinmez; yeni model açınca Komut ara › Önceki oturumu aç ile geri gelir".
- Kayıtta başka bir oturum varken yeni model ya da proje açılırsa, eski kayıt ezilmeden önce "Önceki oturum" olarak saklanır (tek düzey). Kart açıkken model açmak ya da dolu sahneye proje açmak bunu iletiyle söyler: "Önceki çalışma saklandı: Komut ara › "Önceki oturumu aç" geri getirir."
- Komut ara › "Önceki oturumu aç" saklanan oturumu açar; ekrandaki çalışma yerine "önceki" olur (ikisi yer değiştirir).

Uygulamada: oturumun kimliği (`SessionMeta.id`) boş sahneye model ya da proje açılınca yenilenir; kayıtta kimliği farklı bir oturum varsa yazmadan önce `prevMeta`/`prevData`'ya taşınır (aynı IndexedDB işleminde). Kimliksiz eski kayıtlar da ilk yazmada "önceki" olur. Proje açma onay sormaz; kayıp olmadığı için ileti yeterli sayıldı.

Kabul: e2e `session.spec.ts`: Yok say'dan sonra yenileyince kart yine gelir; figure kaydı varken kart açıkken örnek model açılınca ileti çıkar, "Önceki oturumu aç" figure'ü, ikinci kez örneği getirir.

## X107 Dikiş yalnız kendi modunu gösterir

- Dikiş Tapa kullanmaz: Dikiş açıkken şeritte Tapa kapalıdır (ipucu "Dikiş Tapa ile kesmez: Pimli kes ya da Yapıştır") ve vurgulanmaz. Mod Pimli kes değilse Yapıştır vurgulanır; panel başlığı "Yapıştır — dikiş" ya da "Pimli kes — dikiş".
- Panel yalnız Dikiş'in modunun ayarlarını gösterir: Tapa açıklaması, derinlik, yön ve öneri kartı görünmez. Açıklama: "Halkadan ikiye ayırır, kesite pim konur." / "Halkadan ikiye ayırır, parçalar yapıştırılır. Pim için Pimli kes'i seçin."
- Dikiş'te Kes yalnız halka hazırsa açıktır; boyalı seçim Kes'i açmaz. Halka modeli ikiye ayırmıyorsa (kırmızı) Kes kapalı.
- Şerit ipuçları aracın hangi iş için olduğunu söyler: Çizgi "Kıvrımı olmayan bölgeyi çevirip boyar (göz, desen)", Dikiş "Kol, bacak, kafa ayırır: çevresine halka çiz, Kes oradan ikiye böler (Pimli kes ile pim konur). Boyamaz."
- Yardım davranışla aynı: halka düz değilse Kes çizilen halkayı izler; halka modeli ayırmıyorsa kırmızı çizilir ve Kes kapalı kalır.

Uygulamada: kayıtlı kesim modu değişmez (Tapa seçiliyken Dikiş'e geçip dönünce Tapa sürer); Dikiş yalnız gösterimde ve kesimde Pimli kes / Yapıştır'ı kullanır.

Kabul: e2e `seam.spec.ts` X107: boyalı seçimle Dikiş'te Kes kapalı; mod Tapa iken şeritte Tapa kapalı, Yapıştır vurgulu, başlık "Yapıştır — dikiş", Tapa metni ve Derinlik yok; Pimli kes'e geçince başlık değişir; hazır halkada Kes açık, hatalı halkada kapalı.

# Sprint 13: renk ve dışa aktarma doğruluğu

Kaynak: `docs/review/00-ozet.md` #4, #5, #6, #7, #12, #17, #19, #24, #25 ve `docs/review/02b-audit-ux.md` 4, 10. Davranışlar 2026-10-28'de onaylandı (ROADMAP "Review planı"); "Karar" satırlarında önerilen (a) seçildi.

## X109 3MF'teki nesne rengi gövde rengi olur ve geri yazılır

- Bambu/Orca 3MF'te nesne başına filament (`model_settings.config` › `extruder`) okunur. Nesne o filamentin "Filament N" setini gövde rengi olarak alır; set yoksa açılır, rengi dosyadaki filament renginden gelir. Grogu: 12 gövde Filament 3, 6 ve 7 renginde görünür.
- Boyalı nesnede boyasız yüzey (Taban) de gövde rengiyle görünür; Bambu'da boyasız yüzey nesnenin filamentiyle basıldığı için ekran baskıyla aynı olur.
- Dışa aktarmada (3MF — Bambu) "Filament N" setinin rengindeki gövde N numaralı filamente yazılır. Hiçbir şey değiştirmeden aç ve kaydet: her nesne kaynaktaki numarayla çıkar. 3MF'ten gelmeyen renkler (Seçim N, Taban gri) kalan boş numaraları sırayla alır.
- Dosyada nesne filamenti var ama filament renkleri yoksa gövdeler yine numaraya göre gruplanır, renkler paletten gelir ve açılışta söylenir: "Dosyada filament renkleri yok; gövdeler Filament N setlerine ayrıldı, renkleri slicer'daki gibi değil."
- Gövde rengi ağaçta gövde satırındaki renk karesinde görünür (bugünkü gibi); açılış iletisi kaç gövdenin hangi filamentte olduğunu söyler: "Grogu: 12 gövde 3 filamentte (Filament 3, 6, 7)."

Karar (seçilen: a): filament numarası (a) kaynaktaki gibi korunur (önerilen; Grogu'da 3, 6, 7 kalır) ya da (b) renklere göre 1'den yeniden sıralanır (bugünkü davranış; Grogu'da 1, 2, 3).

Uygulamada: set `filament` alanını taşır (proje ve oturum kaydına girer); boyalı 3MF'in setleri de numaralarını taşır. Açılış iletisi yalnız birden çok gövdede çıkar; tek gövdede rengi ekranda görmek yeterli. Bluey'de gövde Filament 1'de olduğu için boyasız yüzey beyaz görünür. Yalnız nesne düzeyindeki filament okunur; Bambu'da nesne içindeki parça başına filament (çok parçalı nesne) okunmaz.

Kabul: birim testi `parse3mf` nesne filamentini okur; e2e Grogu: açılışta gövde renkleri 3 farklı, Bambu 3MF'te `extruder` değerleri kaynaktakiyle aynı (3 ×2, 6 ×3, 7 ×7).

## X110 Dışa aktarmada ne kaybolacağı ve hangi filamentin ne olduğu görünür

- Dışa aktar menüsü açılınca, görünen gövdelerde kesilmemiş boyalı renk varsa menünün üstünde uyarı satırı: "Gövde 1'de kesilmemiş 4 renk var (Filament 2, 3, 4, 5); dosyada gövde tek renk olur." Satıra tıklamak o gövdeyi ve ilk kesilmemiş seti seçer. Dışa aktarma engellenmez.
- Gizli gövdeler de satırda sayılır: "3 gizli gövde dosyaya girmez." Kaynak rozetli eski haller sayılmaz (bilerek dışarıda).
- 3MF hazır olunca ileti kendiliğinden kapanmaz (kapatılana kadar durur) ve eşlemeyi parça ve renk adıyla yazar: "3MF hazır: 9 gövde, 3 filament. Filament 1 — Taban (gri): Bluey. Filament 2 — Filament 1 (beyaz): Gövde 3, Gövde 4. …" Renk adı setin adıdır; renk kutusu iletide set renginde.
- Eşleme son dışa aktarmadan sonra Dışa aktar menüsünde "Son dışa aktarma" satırında da durur (sayfa yenilenene kadar).

Karar (seçilen: a): kesilmemiş renk uyarısı (a) menüde satır, engellemez (önerilen) ya da (b) dışa aktarmadan önce "Yine de aktar / Vazgeç" sorar.

Uygulamada: uyarı satırı gövde adıyla başlar ("figure: kesilmemiş 1 renk (Seçim 2); dosyada gövde tek renk olur."); ad ekle ("'de") çekimlenmez, çünkü gövde adı her şey olabilir. Gövdenin kendi rengindeki boya (aynı set ya da aynı renk) kaybolmadığı için sayılmaz: Bluey'de gövde Filament 1 olduğundan 4 renk sayılır. İletide renk adı yerine set adı ve renk kutusu var ("Filament 1 — Taban: figure"). Kabul testi Bluey yerine figürle yazıldı (hızlı); Bluey Chrome'da elle denendi.

Kabul: e2e Bluey: göz kesildikten sonra Dışa aktar menüsünde kesilmemiş renk satırı ve sayısı; 3MF'ten sonra ileti 8 s sonra hâlâ görünür ve parça adlarını içerir.

## X111 Seçilen bölgenin rengi doğru gelir

- Yeni ya da boş bir sete ilk boya, başka bir setin boyası üzerine geliyorsa (ör. beyaz Filament 1 bölgesinin bir kısmı) set o rengi alır. İlk boya boyasız yüzeye geliyorsa set gövde rengini alır (X109'dan sonra 3MF'teki nesne rengi). Bunu yalnız ilk boya yapar; kullanıcı rengi değiştirdiyse dokunulmaz.
- "+ Seçim seti" yeni sete paletten, mevcut setlerin ve gövde renklerinin hiçbirine yakın olmayan bir renk verir; palet tükenirse ton açısı en uzak renk üretilir.
- Kesimden çıkan gövde setin rengini taşır (X98); böylece beyaz göz tapası beyaz görünür ve 3MF'te beyaz setin filamentine gider.

Uygulamada: renk geçmişe girmez; ilk boyayı geri almak seti eski rengine döndürmez. Bölge çevresiyle aynı renge dönse de aktif setin sınır çizgisi ve ad etiketi onu gösterir. Renk karşılaştırması "redmean" uzaklığıyla; 90'ın altı karışık sayılır.

Kabul: birim testi renk seçici (mevcut renklere en uzak); e2e Bluey: yeni set beyaz bölgeye ilk tıkta beyaz olur; "+ Seçim seti" rengi dosyadaki turuncuya yakın değil.

## X112 Çizgi ne olduğunu doğru söyler

- Halka kendini keserse boyamaz ve söyler: "Çizgi kendini kesiyor; noktaları kesişmeyecek sırayla koy." Bugün halkanın kestiği küçük cep boyanıyor ve yumuşatma onu siliyor.
- Yumuşatmadan sonra boyalı üçgen kalmadıysa başarı iletisi verilmez: "Çizginin içi çok dar; boya kalmadı. Halkayı genişlet." Boyama geri alınır (geçmişte adım kalmaz).
- Başarı iletisi yumuşatmadan sonraki sayıyı yazar.
- Pimli kes "kesit pin için çok ince" uyarısı sonraki adımı söyler: "Kolu ayırmak için halkayı kolun çevresinden geçir ya da Dikiş'i kullan." Aynı ek, kesit yüzeysel olduğunda (öneri "yüzeysel bölge") Pimli kes seçiliyse de çıkar.
- Halka yalnız ilk noktanın üstüne tıklayınca kapanır (en az 3 nokta). İmleç ilk noktanın üstündeyken nokta büyür ve vurgulanır; yakın ama dışarıdaki tık yeni nokta ekler. Enter ve "Kapat" düğmesi değişmez.
- Modelin arkasında kalan noktalar ve yol soluk çizilir; öndekiler bugünkü gibi.

Kabul: birim testi `lasso` kendini kesen halkayı ayırt eder; e2e figür kolunda: kendini kesen halka boyamaz ve ileti verir; ilk noktaya yakın tık nokta ekler, ilk noktaya tık kapatır.

Uygulamada: aynı köşeden iki kez geçen halka kesişiyor sayılır (kenar yolları yalnız köşelerde buluşur); kendine değen halka da boyanmaz. İlk nokta, imleç işaretin 1,2 katı yarıçap içindeyken "üstünde" sayılır. Arkadaki kısım derinlik testsiz, %30 opaklıkla çizilir. E2e kol yerine gövdenin önünde yazıldı (koordinatları bilinen geniş yüzey). Dar halka durumu e2e'de yok.

## X113 Bölge içindeki başka renk tapaya sessizce katılmaz

- Seçili bölgenin içinde kalan başka setin boyası (ör. göz akının içindeki siyah gözbebeği) kesimde tapaya katılır, ama ileti rengi adıyla söyler ve sonraki adımı verir: "Bölgenin içinde Filament 4 var (3.753 üçgen); tapaya katıldı. Ayrı basmak için kesimden sonra tapayı seçip Filament 4'ü kes." Tapa o boyayı taşıdığı için bu ikinci kesim çalışır (iç içe tapa).
- Gerçekten boyasız delik (Taban) için ileti: "Bölgenin içindeki N boyasız alan tapaya katıldı."
- Önizleme açıkken aynı bilgi seçim satırının altında görünür; kesimden önce görülür.

Karar (seçilen: a): başka renkli iç bölge (a) tapaya katılır, ileti doğru ve sonraki adım söylenir (önerilen; çekirdek değişmez, S) ya da (b) tapadan çıkarılır, tapa halka biçiminde olur ve iç renk gövdede kalır (çekirdekte delikli kapak gerekir, M–L, risk: Socket ve Keys'in halka kapağı bugün tek sınır varsayıyor).

Kabul: birim testi `cutRun` iç bölge uyarısı rengi ve üçgen sayısını taşır; e2e Bluey: göz akı kesilince ileti "Filament 4" der; tapa seçilip Filament 4 kesilince ikinci tapa çıkar.

Uygulamada: ad eki çekimlenmez, ileti "…tapayı seçip Filament 4 setini kes." der (set adı her şey olabilir). Pimli kes ve Yapıştır'da "tapa" yerine "kesilen parça". Önizlemede fiil "katılacak". Başka rengin 1 mm²'den küçük kırıntısı ileti olmaz (Bluey'de 1–5 üçgenlik kırıntılar vardı). Bluey'de "göz akı" ayrı boya değil (gövde Filament 1); kabul testi turuncu bölgeyle (Filament 5, içinde 9.102 üçgen Filament 4) yazıldı. Tapadan Filament 4 kesilince siyah tek değil birkaç parça çıkıyor (tapadaki siyah birden çok yerde).

## X114 Olmayacak kesimde Kes kapalı, hatalar ne yapılacağını söyler

- Önizleme kesimin olmayacağını bulduysa (ör. "bölge parçanın tamamını kaplıyor") Kes kapanır ve neden seçim satırında yazar; ileti bir kez çıkar. Boya, set, mod ya da ayar değişince Kes yeniden açılır.
- Aynı metinli ileti ekranda zaten varsa yenisi eklenmez; var olanın süresi yenilenir.
- Seçim basılamayacak kadar küçükse (bölgenin en büyük boyutu 3 mm'den az) seçim satırında uyarı: "Seçim 2,6 mm; basılamayabilir." Kes açık kalır.
- Kesim hataları ve uyarıları ne yapılacağını söyler:
  - "Bölge parçanın tamamını kaplıyor" → "Bölge bütün gövdeyi kaplıyor; kesilecek sınır yok. Bir kısmını Silgi ile çıkar."
  - "Sınır halkası kapak düzleminde çökük" → "Sınır kapak için fazla kıvrık. Kenarı düzelt'i aç, Yumuşat ile kenarı düzelt ya da Düzlemle kes'i dene."
  - "Düzlem kesimi bölgeyi içeren bir parça üretmedi…" → "Bu halkadan düzlemle kesilemiyor. Halkayı bölgenin daha düz yerinden geçir ya da Tapa ile kes."
  - "N çok küçük boyalı kırıntı atlandı" → "N küçük boya lekesi atlandı (1 mm² altı). Kesmek istiyorsan Fırça ile büyüt."
  - "süpürme + prizma", "süpürme kullanıldı" → "Bölge tek yönden tam görünmüyor; tapa yaklaşık. Tapa yönünü değiştir ya da bölgeyi küçült."
  - "N hacimsiz parça atlandı" → "N parça hacimsiz çıktı ve atlandı; Tapa yönünü değiştir."

Kabul: e2e figür: Kova ile bütün gövde boyanınca Kes kapalı ve neden yazılı, ileti bir kez; tek üçgenlik seçimde boyut uyarısı; birim testi yeni hata metinleri.

Uygulamada: Kes yalnız önizleme çalıştıysa kapanır (önizleme kapalıyken hata bilinmez). Önizleme açıkken girdi değişince önizleme yeniden hesaplanır ve aynı hata yine Kes'i kapatır; ileti tekrar çıkmaz. Dikiş önizlemesi bu kurala girmez (Kes zaten halka hazır olunca açık). "süpürme kullanıldı" ve "süpürme + prizma" uyarıları aynı metne indi. Boyut uyarısı bölgenin sınır kutusunun en uzun kenarıdır. E2e'de tek üçgen yerine küçük fırça (0,3 mm) tıklaması.

# Sprint 14: deneme parçası döngüsü

Kaynak: `docs/review/01-yolculuk.md` görev (c), `docs/review/02-ux-audit.md` O7–O9, `docs/review/02b-audit-ux.md` 1–3. Davranışlar 2026-10-29'da onaylandı; "Karar" satırlarında önerilen (a) seçildi.

Döngü: deneme parçasını bul → üret → indir → bas → en iyi oturan deliği seç → sonraki modellerde o tolerans kullanılır.

## X115 Deneme parçası modelden ayrı, her yerden açılır

- Deneme parçası üç yerden açılır:
  - boş ekranda "Örnek modeli aç"ın altında ikinci düğme: "Tolerans deneme parçası";
  - komut aramada "Tolerans deneme parçası" ("deneme", "tolerans", "pim", "boşluk", "test" ile bulunur);
  - kesim panelindeki bugünkü "Deneme parçası üret" düğmesi.
- Açılınca "deneme görünümü"ne geçilir (Karar a):
  - Görünümde yalnız plaka ve pimler var, kameraya sığdırılmış. Model silinmez ve gizlenmez (göz durumları değişmez), yalnız bu görünümde çizilmez.
  - Görünümün üstünde bir şerit:
    "Tolerans deneme parçası · [Tapa | Pimli kes] · boşluklar 0,1 / 0,2 / 0,3 mm · [İndir ▾] [Kapat]".
  - Tapa/Pimli kes seçimi parçayı yeniden üretir. Tapa: Ø8 silindir (bugünkü gibi). Pimli kes: kesim ayarlarındaki pim şekli ve ölçüsü; şeritte "Pim: silindir Ø4 × 8 mm" gibi yazar. Model yokken de çalışır.
  - "İndir ▾" Dışa aktar menüsündeki biçimleri sunar (Bambu 3MF, genel 3MF, STL ZIP). Dosya adı `tolerans-deneme.3mf` / `tolerans-deneme.zip`. Dosyada yalnız plaka ve pimler var.
  - "Kapat" ya da Esc modele döner. Deneme parçası sahneye, geçmişe (Ctrl+Z), oturum kaydına ve modelin dışa aktarmasına girmez. Adım şeridi değişmez.
  - Görünüm açıkken Seç/Kes araçları ve sol panel kapalıdır; komut arama açık.
- Model yokken boş ekran deneme görünümünden sonra yine boş ekrandır.

Karar (seçilen: a): (a) ayrı deneme görünümü (önerilen; parça görülür, modele hiç karışmaz, M) ya da (b) düğme doğrudan `tolerans-deneme.3mf` indirir, ekranda gösterilmez (S; parça slicer'da görülür, ama hangi boşlukların üretildiği yalnız iletide kalır).

Kabul: e2e boş ekran: düğmeyle deneme görünümü açılır, İndir 3MF'te yalnız plaka + pimler; Kapat sonrası parça listesi boş, geçmiş boş. Figür açıkken: komut aramadan açılır, Kapat sonrası figür aynı, adım şeridi "Seç"te.

Uygulamada: şerit sol üstte (görünüm küpüyle çakışmasın diye). Açıkken üst şerit ve geçmiş çubuğu soluk ve tıklanmaz; başlıktaki Aç, Kaydet ve Dışa aktar modelle çalışmaya devam eder (Aç ya da dosya bırakma görünümü kapatır). Bugünkü kesim panelindeki düğme seçili moda göre açar; boş ekran ve komut arama son kullanılan ya da kesim ayarındaki modu kullanır. Eski "Deneme parçası eklendi…" iletisi yerine bilgi şeritte.

## X116 Seçilen tolerans kalıcı, deneme parçasından değer seçilir

- Tolerans (`cut.clearance`) tarayıcıda kalıcıdır (Tabla ayarı gibi). Yeni model, "Yok say" ve sayfa yenileme son seçilen değeri kullanır. "Devam et" ile açılan oturum kendi değerini getirir ve o değer yeni tercih olur.
- Tolerans düğmeleri değeri yazar: "Sıkı 0,1", "Normal 0,2", "Gevşek 0,3".
- Deneme parçası deliğin önündeki çentikle boşluğu gösterir: soldan 1, 2, 3 çentik. Son üretilen deneme parçasının eşlemesi tarayıcıda kalır ve Tolerans grubunda (ve deneme görünümünün şeridinde) görünür:
  "Son deneme parçası (Pimli kes, silindir Ø4): 1 çentik 0,1 · 2 çentik 0,2 · 3 çentik 0,3 mm"
  Her değer bir düğmedir; basınca tolerans o değer olur. Böylece basılı parçada en iyi oturan deliğin çentiği sayılıp doğrudan seçilir.
- Tolerans 0 iken boşluklar 0 / 0,1 / 0,2 mm olur (Karar a); her zaman 3 delik, ileti ve eşleme gerçek değerleri yazar.

Karar (seçilen: a): tolerans 0 iken (a) üç delik yukarı kayar: 0 / 0,1 / 0,2 (önerilen; çentik sayısı hep 1–3, eşleme hep aynı biçim) ya da (b) bugünkü gibi iki delik (0 / 0,1) ve ileti "1, 2 çentik" der.

Karar (seçilen: a): kalıcı olan (a) yalnız tolerans (önerilen; roadmap maddesi) ya da (b) tolerans + pim şekli, ölçüsü ve boy boşluğu (deneme parçası pimle basıldıysa pim de aynı kalmalı; ama pim ölçüsü modele göre değişir).

Kabul: birim testi tolerans 0'da 3 boşluk; e2e: Gevşek seçilir, sayfa yenilenip "Yok say" denince Gevşek seçili; deneme parçası üretilince eşleme satırı görünür, "3 çentik" düğmesi toleransı değiştirir, yenilemeden sonra eşleme durur.

Uygulamada: tolerans 0'ın altına düşen her değerde (ör. 0,05) üç delik yukarı kayar: 0,05 / 0,15 / 0,25. Deneme şeridinde eşleme "Oturan delik: 1 çentik 0,1 · …" olarak durur; ayrı "soldan 1, 2, 3 çentik" yazısı kalktı. Paneldeki "Tapa ile yuva arası 0,2 mm" yazısı da virgülle.

# Sprint 15: metin, klavye, erişilebilirlik, pürüzler

Kaynak: `docs/review/00-ozet.md` #11, #13–16, #18, #20–23, #26–30; `docs/review/03-arayuz.md` (W, K, C tabloları); `docs/review/02b-audit-ux.md` 10, 11. Davranışlar 2026-10-29'da onaylandı; "Karar" satırlarında önerilen (a) seçildi.

## X117 Metin birliği

- Dosya açılamazsa ham istisna metni gösterilmez:
  - Okunamayan STL/OBJ/3MF: "Dosya okunamadı: {ad}. Bozuk ya da başka bir biçimde olabilir. Slicer'dan yeniden STL ya da 3MF olarak kaydedip dene."
  - Desteklenmeyen tür: ".txt açılamaz. STL, OBJ, 3MF ya da .3dsplit dosyası seç."
  - Ayrıntı (istisna metni) konsola yazılır.
- Arayüzden çıkan adlar (iletiler, Yardım, Kısayollar, komut arama, ipuçları):
  - "slot" → "seçim seti" ya da "set" ("Taban slotu kesilemez" → "Taban kesilemez; kesilecek seti seç.", "0–9 slot seç" → "0–9 set seç").
  - "Smart Fill" → "Akıllı seç"; "Keys" → "Pimli kes"; "Socket" → "Tapa"; "Fast" → "Yapıştır".
  - Kod tanımlayıcıları değişmez.
- İnce ayar etiketleri (03-arayuz W18): "Gövdede pay %" → "Pimin gövdeye giren kısmı (%)", "Uç pahı" → "Pim ucu eğimi", "Duvar" → "Delik çevresinde en az et", "Sıkıştır %" → "Tapayı daralt (%)". Kısa ad + mevcut ipucu (title) korunur.
- Ondalık tek biçim: arayüzde görünen bütün sayılar `tr-TR` (0,2 mm; 12.131 üçgen; ~17,5 mm). Ortak bir `formatNumber` yardımcısı.
- Dar alanda kesilen adlar (set listesi, gövde listesi) tam adı `title` ile gösterir.

Kabul: e2e: rastgele baytlı `.stl` ve `.txt` bırakılınca yeni metinler; birim testi `formatNumber`; arayüz metinlerinde (`src/ui`, `src/state` iletileri) "slot", "Smart Fill", "Keys" geçmez (grep testi).

## X118 Klavye ve ekran okuyucu

- Araç penceresinde odak alan öğe yapışkan Önizleme / İptal / Kes alanının altında kalmaz: kaydırma alanına `scroll-padding-bottom` (alt alanın yüksekliği).
- Yardım ve komut arama gerçek modal: açılınca odak içeri girer, Tab içeride döner, kapanınca odak açan öğeye döner; `aria-modal="true"`.
- Kesimden sonra odak `body`'ye düşmez: yeni parçanın Model ağacındaki satırına gider.
- Bildirimler `button` (Enter/Space kapatır). Bildirim alanı `aria-live="polite"`, hata bildirimi `role="alert"`. Hata bildirimleri Esc ile kapanmaz (Esc başka işlere ayrılmış); odaklanıp Enter ile kapanır.
- Panel başlıkları (`h3 onClick`) `button` olur; `aria-expanded` taşır.

Kabul: e2e klavye: Tolerans düğmesine Tab ile gelinince düğme görünür alanda (`elementFromPoint` kendisi); `?` ile Yardım açılınca odak içeride, 40 Tab sonra hâlâ içeride; Kes'e Enter sonrası `document.activeElement` yeni parça satırı; bildirim Enter ile kapanır.

## X119 Kontrast

- Metin en az 4,5:1, seçili segment ve odak halkası en az 3:1 (03-arayuz C1–C11):
  - Kes düğmesi: koyu yeşil zemin (`#1f7a45`) + beyaz metin.
  - Set rengiyle yazılan rozet ve durum satırı: renk metne değil yanındaki kutuya; metin açık gri. Rozet zemini set rengi kalırsa metin rengi zemine göre siyah/beyaz seçilir (`contrastColor`, sınır çizgisinde zaten kullanılıyor).
  - Seçili satırdaki sayılar, gelecek adımlar, menü açıklamaları, set numaraları: gri tonları açılır.
  - Seçili segment: `#2f6fd6` yerine `#2558b0` + beyaz metin.
  - Odak halkası: uygulama kendi halkasını çizer (2 px `#ffd400`), her zeminde 3:1 üstü.

Kabul: e2e: listelenen 11 öğe için `getComputedStyle` renklerinden WCAG oranı hesaplanır, eşiğin üstünde.

## X120 Görünüş küpünden arka ve alt

- Küpte o an bakılan yüze tıklamak karşı yüze çevirir: Ön'deyken Ön → Arka, Üst'teyken Üst → Alt (Karar a). Yüzün `title`'ı bunu söyler ("Ön · tekrar tıkla: Arka").
- Arkada kalan yüzlerin düğmeleri tıklanamaz ve odak almaz (bugün 14 düğmenin 9'u başka öğenin altında).

Karar (seçilen: a): (a) bakılan yüze tekrar tık karşı yüz (önerilen; küp değişmez, S) ya da (b) küpün altına iki küçük düğme "Arka", "Alt" (görünür ama kalabalık).

Kabul: e2e: Ön görünüşte küpün Ön yüzüne tık kamerayı arkaya çevirir; ikinci tık öne döner.

## X121 İkinci "Aç" ne yapacağını sorar; çok plakalı 3MF dağılmaz

- Model açıkken yeni dosya açılınca (Aç ya da sürükle bırak) kart sorar: "{dosya} açılıyor. [Yerine aç] [Sahneye ekle] [Vazgeç]". Yerine aç bugünkü sahneyi "Önceki oturum"a bırakır (X106 gibi) ve yeni oturum başlatır; Sahneye ekle bugünkü davranış. `.3dsplit` açarken yalnız Yerine aç ve Vazgeç.
- Çok plakalı Bambu 3MF'te her plakanın nesneleri kendi plakasındaki yerleşimiyle gelir; plakalar X ekseninde yan yana, aralarında 20 mm (Karar a). Gövde adları plaka adını taşır ("Plaka 2 · Kafa"). Tek plakalı dosya değişmez.

Karar (seçilen: a): çok plakalı dosyada (a) bütün plakalar yan yana açılır (önerilen; hepsi bir arada kesilir, S–M) ya da (b) hangi plakanın açılacağı sorulur (yalnız o plaka gelir; diğerleri için dosya yeniden açılır).

Kabul: e2e figür açıkken ikinci figür: kart çıkar, Yerine aç sonrası 1 gövde, "Önceki oturumu aç" ilk sahneyi getirir; Sahneye ekle sonrası 2 gövde. Birim testi Grogu benzeri iki plakalı 3MF'te nesnelerin plakalara göre ayrı X aralıklarında olması.

## X122 Delete yalnız seçili pimi siler

- Önizleme açıkken ya da Pim aracında Delete/Backspace yalnız seçili pimi siler; pim seçili değilse hiçbir şey yapmaz ve ileti: "Silinecek pim seçili değil. Pime tıkla, sonra Delete."
- Bu durumların dışında Delete bugünkü gibi seti temizler, ama artık iletiyle: "Seçim 2 temizlendi (2.738 üçgen). Ctrl+Z geri getirir."

Kabul: e2e figür kolu Pimli kes önizlemesi: pim seçiliyken Delete pim sayısını 1 azaltır, seçili değilken boya ve pimler aynı, ileti çıkar.

## X123 Kesimden sonra parça görünür, iletiler yığılmaz, tek İptal

- Kesimden sonra yeni parça seçili olur (turuncu çerçeve, gövdenin içindeyse de görünür). Kesim iletisinde "Ayrık göster" düğmesi Aralıklı görünümü açar (Karar a).
- Geri alınınca o kesimin iletileri ("Kes 1: …" ve uyarıları) kapanır. Ekranda en çok 3 ileti; daha eskisi kapanır (bugün 5).
- Meşgul kartı açıkken araç penceresindeki İptal gizlenir; tek İptal kartta (işi durdurur).

Karar (seçilen: a): (a) yeni parça seçilir + iletide "Ayrık göster" (önerilen; görünüm değişmez) ya da (b) kesimden sonra Aralıklı kendiliğinden 2 s açılıp kapanır.

Kabul: e2e figür burun kesimi: seçili parça burun tapası; "Ayrık göster" Aralıklı'yı açar; Ctrl+Z sonrası "Kes 1" iletisi yok; kesim sürerken araç penceresinde İptal yok.

## X124 Parçalara bölünmüş modelde yönlendirme

- Açılan dosyada birden çok gövde var ve hiçbirinde boya yoksa (Grogu gibi) ileti: "{N} gövde ayrı parça olarak geldi; renkler zaten ayrı. Kesmeden dışa aktarabilirsin; bir gövdenin içinden renk ayırmak için onu seçip boya." Adım şeridi bu durumda "Aktar"ı da etkin gösterir.
- Tek gövdeli boyasız modelde değişiklik yok.

Kabul: e2e Grogu (dosya varsa): ileti çıkar; figürde çıkmaz.

## X125 Model yokken araçlar kapalı

- Model yokken şerit araçları, araç penceresi ve Kes alanı soluk ve tıklanmaz (`disabled`); ipucu "Önce bir model aç." Deneme parçası (X115) ve komut arama açık.
- Space ve araç kısayolları model yokken tek ileti verir: "Önce bir model aç." (bugün yanlış ileti).

Kabul: e2e boş ekran: Fırça düğmesi disabled; Space ileti "Önce bir model aç."; model açılınca araçlar etkin.

## X126 Dışa aktarılan dosyanın adı kaynaktan gelir

- Dosya adı açılan ilk dosyanın adından (uzantısız) gelir: `Bluey_Color.3mf` açıldıysa `Bluey_Color-parcalar.3mf` (Bambu), `Bluey_Color-genel.3mf`, `Bluey_Color-parcalar.zip`. Örnek modelde "ornek-figur". `.3dsplit` açıldıysa projenin adı.
- Dosya içindeki STL adları okunur kalır: Türkçe harfler ve boşluk korunur, yalnız dosya sisteminde geçersiz karakterler (`/ \ : * ? " < > |`) `-` olur ("Tolerans plakası (0,1 - 0,2 - 0,3 mm).stl").
- Deneme parçası X115'te `tolerans-deneme.*` aldı; değişmez.

Kabul: birim testi dosya adı temizleme; e2e figure.stl açılıp Bambu 3MF indirilince ad `figure-parcalar.3mf`.

## X127 Uzun kesimde ilerleme

- Meşgul kartı aşamayı sırayla yazar: "Aşama 3/6 · Tapa hacmi" ve bir ilerleme çubuğu (aşama sayısına göre). Aşama listesi her kesim türü için sabit (Karar a).
- 5 s'yi geçen işte, bu tarayıcıda aynı türden son kesimlerin hızına (üçgen/s) göre "~8 sn kaldı" tahmini; geçmiş yoksa yazmaz.

Karar (seçilen: a): ilerleme (a) aşama sayısıyla (önerilen; Worker zaten `stage()` gönderiyor, M) ya da (b) yalnız süre tahmini (aşama değişmez, S; ilk kesimde hiç bilgi yok).

Kabul: birim testi kesim türü başına aşama listesi ve tahmin hesabı; e2e Bluey (dosya varsa): kartta "Aşama n/m" görünür.
