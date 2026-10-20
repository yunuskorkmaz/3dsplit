# Hedef: slicer'dan önce basılabilir parçalar

18 Ekim 2026. Ürünün işi değişmiyor: modeli slicer'a göndermeden önce ayrı basılıp sonra birleşen parçalara ayırmak. Bu dosya o hedefin sırasını ve kararlarını tutar. Madde durumları `docs/ROADMAP.md`.

## Kim için, ne başarı

Figür ve benzeri kapalı modeller. Kullanıcı boyama bilmeden de kolu, bacağı istediği yerden ayırabilmeli; göz ve kaş gibi detayda mevcut Socket akışı kalmalı. Kesilen parçanın kenarı üçgen merdiven gibi görünmemeli. Kamera, model ekranı doldururken arkasını göstermeli. Arayüz, araç yığını değil adım adım bir program gibi okunmalı.

Başarı:

- Göz ve kaş kesimi bugünkü gibi tapa ve yuva üretir; kenar, boyanın tırtıklı üçgen sınırını izlemez.
- Kol veya bacak, yüzeyde çizilen kapalı bir halkadan iki kapalı parçaya ayrılır ve kesit yüzüne pim konabilir.
- Tek tıkla arka, ön, sol, sağ ve üst görünüşe geçilir.
- Boş ekran ve paneller, sıradaki adımı söyler: aç, seç veya çiz, kes, dışa aktar.

## Bilinçli olarak sonraya bırakılanlar

Özel mesh'ten pim, oynar eklem, iki temaslı kesimi aynı anda işlemek (kol hem omuz hem kalça), kesimleri üretmeden taslak listesinde biriktirmek, yamuk pim. CatPin'de var; bu turda yok. İstenince ayrı iş olur.

## Kararlar

Üç yerde birden fazla yol vardı. Seçilen yol ve bırakılanlar:

**Kesim kenarı pürüzlü.** Yeni yüzler, boyanın üçgen kenarına kilitli sınırını kapak ve tapa olarak izliyor. Viewport malzemesi de `flatShading` ile her üçgeni düz boyuyor; bu, kaba kapağı daha da belli ediyor.

1. Kesimden hemen önce mevcut `smoothRegionBoundary(..., exact: true)` ile sınırı üçgenlerin içinden geçirmek. Yarıçap, ortalama kenarın katı; kapatılabilir, varsayılan açık. Öneri bu: göz ve kaş akışı bozulmaz, STL'deki kenar da düzelir.
2. Tüm modeli remesh etmek. Heykel detayını yer, ağır.
3. Yalnızca gölgeyi yumuşatmak. Ekran düzelir, dışa aktarılan kenar tırtıklı kalır.

Gölge ayrı ve küçük bir iş: kesimle oluşan yeni yüzler yumuşak normal alır, boyalı heykel yüzeyi düz gölgede kalır. İkisi birlikte X53.

**Kol ve bacak.** CatPin elle kesimi, yüzeydeki çizgiyi dikiş yapıp iki yana pim basıyor. Bizim çizgi aracı halkanın içini boyuyor; bu, göz için doğru, kolu ikiye bölmek için değil.

1. Kapalı yüzey halkası, halkanın Newell düzlemine yakınsa düzlemle ikiye bölünür, iki yüz kapatılır, mevcut Keys pimleri o yüze konur. Öneri bu. `planeSplit` ve pim boolean'ı duruyor.
2. Eğriyi serbest bir süpürme yüzeyine çevirmek. Kavisli omuz için daha iyi, ilk sürüm için fazla.
3. Kullanıcıdan kuşağı boyatıp bugünkü Keys'i kullanmak. Yeni araç yok ama "istediğim yerden çiz" isteğini karşılamaz.

Halka düzlemden yarıçapın %15'inden fazla saparsa düzlem kesimi yapılmaz. Halka yine de yüzeyi iki bölgeye ayırıyorsa kesim o çizgiyi izler ve kapağı halkanın kendisinden üretir (X63). Ayırmıyorsa kesim durur ve halka kırmızı çizilir.

**Kesim yüzleri arası boşluk.** Düz dikiş ve düzlem kesiminde yüzler `faceGap` kadar ayrılır (X64). 0 ise birbirine değer. Pim deliği toleransı ayrıdır. Çizgiyi izleyen eğri kesitte boşluk uygulanmaz.

**Kamera.** Sol tık modelin üstündeyken araca gidiyor. Sağ sürükleme döndürüyor ama model ekranı doldurunca arka yüze ulaşmak uzun bir yay ve hedef bütün sahnenin merkezi.

1. Görünüş düğmeleri (ön, arka, sol, sağ, üst) ve hedef olarak seçili parçanın merkezi. Öneri bu.
2. Blender'ın tüm gezinti modelini baştan yazmak. Mevcut sağ sürükleme ve sığdır bozulur.
3. Yalnızca yardım metni. Arkaya dönmeyi kolaylaştırmaz.

**Arayüz.** X55’teki adım şeridi ve iki başlık duruyor. Onaylanan sonraki adım X58: model sahnenin kendisi. Araçlar üstte cam şerit (Seç, Kes). Seçilen aracın ayarı şeridin altında, arada boşlukla durur. Parça ve renk solda, seçili işin kartı sağda, geçmiş altta adlı adımlar. Görünüş, modelin sağ üstünde yüzen bir küptür (X59). Yüze basınca kamera o yana gider ve küp de o yöne döner. Köşeye basınca çapraz bakış olur. Kenara yapışık sütun yok. Seçili rengin çevresi modelde çizilir ve adı orada durur. İnce ayar kapalı kalır.

## Sıra

Her madde kendi başına kullanılabilir. Bir sonrakine geçmek için öncekini bitirmek gerekmez; pürüz ve kamera dikişi beklemez.

| # | İş | Bitti sayılması |
| --- | --- | --- |
| X53 | Kesimde kenarı düzelt | Tırtıklı bir seçim, kesimden sonra eğriye yakın bir sınır bırakır. Yeni yüzlerin gölgesi düz üçgen değildir. Kapatılınca bugünkü kesim aynı kalır. Test: `test/` |
| X54 | Görünüş ve parça merkezi | Ön, arka, sol, sağ, üst tek tık. Seçili parçanın etrafında dönülür. Slot tuşları 0–9 durur |
| X55 | Program kabuğu | Adım şeridi, boş durum, kesim paneli Detay / Ayır. Mevcut kısayollar durur |
| X56 | Dikiş kesimi | Kapalı halka kolu iki kapalı parçaya böler, kesit yüzüne pim konur. Düzlemden sapınca anlaşılır hata. Test: `test/` |
| X59 | Görünüş küpü | Modelin sağ üstünde yüzer. Yüz o yana bakar ve küp döner; köşe çapraz bakıştır. Araç ayarı şeritle üst üste binmez |

## X53 — kesimde kenarı düzelt

Kesim, önizleme ve pim yerleşimi, ayar açıksa Worker'da kopya üzerinde `smoothCutEdge` çağırır. Bu, `smoothRegionBoundary(..., exact: true)` demektir. Yarıçap ortalama kenarın 4 katıdır; Gauss zaten çevrenin altıda biriyle sınırlıdır, küçük halka noktaya çökmez. Bölgeye yalnız taban slotu katılır. Çıkan üçgen, komşulardaki en sık diğer etiketi alır. Boyama kaydı ve parça listesi değişmez; geri alma kesimin mevcut parça kaydıdır.

Manifold önbelleği bu kopyaya orijinal `geomKey` ile bağlanmaz. Anahtar `geomKey + slot + etiket özeti` olur ve manifold yumuşatılmış kopyadan kurulur. Ayar kapalıyken eski anahtar ve ham mesh durur.

Yeni yüzler `fromManifoldMapped` içinde `cut` bayrağı alır. Viewport bu yüzün normalini heykel yüzeyiyle karıştırmaz; kesim yüzleri kendi aralarında 60° eşiğiyle yumuşar. Heykel yüzeyinin gölgesi X62’deki yumuşak normaldir. Ayrı bir kesim mesh’i yok: bayrak aynı geometride durur, proje dosyası onu saklar.

Dosyalar: `src/core/smooth.ts`, `src/worker/geometry.worker.ts`, `src/state/store.ts`, `src/ui/Panels.tsx`, `test/selection.test.ts`.

## X54 — görünüş

`Viewport.viewFrom(direction)` kamerayı hedefe bu yönde, mevcut uzaklıkta koyar. Yönler hedefin yerel dünyasında: ön −Y, arka +Y, sol −X, sağ +X, üst +Z. Hedef, seçili görünür parçanın kutusu; yoksa görünenlerin kutusu. Düğmeler viewport'un sağ üstünde. Kısayol: Alt yok, rakam yok; `Ctrl+1` çakışır. Ok tuşları kaydırma sanılır. Seçim: `Home` sığdır duruyor; görünüşler `Keypad1/3/7/9/0` yoksa harf: ön `Numpad` yerine panel düğmesi ve `Shift+1`…`Shift+5` çakışmaz çünkü slot seçimi yalnızca çıplak rakam.

Dosyalar: `src/viewport/Viewport.ts`, `src/ui/ViewportHost.tsx`, `src/ui/App.tsx` veya küçük bir `ViewGizmo` bileşeni, `src/state/keymap.ts`, yardım metni.

## X55 — kabuk

Viewport üstünde dört adım. Aktif adım: parça yoksa Aç, seçili parçada boya varsa Kes, kesilmiş parça varsa Aktar, yoksa Seç. Boya, Aktar'ın önüne geçer; ikinci kesim adımı kaybolmaz. Ortadaki boş durumda aynı metin ve Aç düğmesi.

Kesim paneli iki başlık: **Detay** Socket ayarları (derinlik, squeeze, kesit, ayak). **Ayır** bugünkü Keys ve Fast, X56 gelince dikiş aracı buraya bağlanır. X55, X56'yı beklemeden Keys'i "Ayır" başlığı altına alır.

Dosyalar: `src/ui/App.tsx`, `src/ui/Header.tsx`, `src/ui/Panels.tsx`, `src/ui/styles.css`.

## X56 — dikiş

Yeni araç **Dikiş** (çizgi aracının yanına). Yüzeye nokta, araları mevcut `surfacePath`. Halka kapanınca içi boyanmaz. Kes, halkanın Newell düzlemiyle bir yarı-uzaydır; bu, yalnızca halkanın kendi düzlemine yakın olduğunu değil, düzlemin katıyı başka yerden de kesmediğini gerektirir. Halka düzlemden yarıçapın %15'inden fazla saparsa, ya da düzlem katıda birden fazla kesişim halkası bırakırsa kesim durur ve halka kırmızı çizilir. Tek halka ve kapak çizilen halkaya yakınsa iki yüz kapatılır. Mevcut pim şekli, tolerans, pah ve "pim hangi tarafta" o yüze uygulanır. Pim konmazsa yapıştırmalık iki parça olur. `isHeightField` bu kesimin güvencesi değildir; o yalnızca Socket süpürmesine aittir.

Dikiş, boyalı slot kesiminin yerine geçmez. Göz hâlâ Socket.

Dosyalar: `src/core/lasso.ts` (yol hazır), yeni kesim fonksiyonu `src/core/cut.ts` içinde `seamCut`, `src/worker/geometry.worker.ts`, `src/state/actions.ts`, `src/ui/Toolbar.tsx`, `src/ui/Panels.tsx`, `test/`.

## Dosya sınırı

`cut.ts` zaten büyük. `seamCut` aynı dosyada, `planeSplit`'in yanında başlar. Ayrı dosyaya ancak fonksiyon kendi yardımcısıyla birlikte 200 satırı geçerse çıkılır. `smooth.ts` ve `Viewport.ts` yalnızca X53 ve X54'ün dokunduğu yerden değişir.
