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
- Seçili parça 300 bin üçgenden büyükse Tapa önizlemesi kendiliğinden açılmaz. Panelde "Büyük model: önizleme için Space" yazar.

Kabul: figure.stl'de burun Tapa ile, Space'siz önizleme görünür. Bluey (500 bin) Tapa'da kendiliğinden açılmaz.

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
