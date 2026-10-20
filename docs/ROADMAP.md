# Yol Haritası ve İş Listesi

Uygulamanın amacı: modelde göz, kaş, kol gibi bir bölgeyi Smart Fill ile seçmek, eksik kalan yerleri fırçayla düzeltmek, sonra o bölgeyi ana modelden **Socket** (tapa + yuva) veya **Keys** (pim + yuva) ile ayırıp ayrı basılabilir parça yapmak.

Özellik numaraları [proje dokümanındaki](project-brief.md) tabloya karşılık gelir. Ek işler `X` ile numaralanır.

**Durum (2026-10-20):** A1–E2, X1–X72 bitti. Sıradaki işler X73–X76 (Sprint 7, `docs/catpin-flow.md`). Yeni iş **X77** ile eklenir. Hedef: [docs/HEDEF.md](HEDEF.md).

## Sprint 6 — slicer öncesi parça ayırma

Ayrıntı ve bırakılanlar `docs/HEDEF.md`.

| # | İş | Neden | Durum |
| --- | --- | --- | --- |
| X53 | Kesimde kenarı düzelt: kesimden önce sınırı üçgen içinden geçir. Yeni yüz kendi komşularıyla gölgelenir, heykel yüzeyiyle birleşmez | Kesilen parça tırtıklı çıkıyor | [x] |
| X54 | Görünüş düğmeleri (ön, arka, sol, sağ, üst) ve dönüş merkezi seçili parça | Modelin arkasına dönmek zor | [x] |
| X55 | Program kabuğu: adım şeridi, boş durum, kesim paneli Detay / Ayır | Araç yığını gibi duruyor | [x] |
| X56 | Dikiş kesimi: kapalı yüzey halkasıyla ikiye böl, kesit yüzüne pim | Kol ve bacak istenen yerden ayrılsın | [x] |
| X57 | Slot seçince o boya öne çıkar; satırdaki sil yalnız seçimi kaldırır, slot kalır | Öneri çok slot açıyor, hangisi nerede belli olmuyor | [x] |
| X58 | Yüzen sahne: cam şerit, komut kartı, adlı geçmiş; seçili rengin çevresi ve adı modelde | Fusion’a yakın, model sahnenin kendisi olsun | [x] |
| X59 | Görünüş küpü: modelin sağ üstünde yüzer, yüz ve köşe bakışı küple birlikte döner | Şeritteki yazı düğmeleri CAD görünüşüne benzemiyor | [x] |
| X60 | Düğme ve rozet adları: simge ve İngilizce yerine ne yaptığı yazan kısa Türkçe | Üçgen sayısı, ◎, X-ray, sil, Slot ne işe yarıyor belli değil | [x] |
| X61 | Rengi listeden kaldır: boya varsa tabana döner, geri alma rengi geri getirir | Öneri satırları temizlenince listede kalıyor | [x] |
| X62 | Açılışta yumuşak gölge: komşu yüzler 60°'ye kadar aynı normali paylaşır | Aynı STL, düz gölgede olduğundan köşeli duruyordu | [x] |
| X63 | Düzlem tutmayan dikiş, halka yüzeyi ikiye bölüyorsa çizilen çizgiyi izler | Kol kesimi hafif dalgalı halkada duruyordu | [x] |
| X64 | Düz kesilen yüzler arasında boşluk; 0 ise birbirine değer. Pim toleransından ayrı | Baskıda yüzler yapışmasın | [x] |
| X65 | Tapa yuvası payı kopya birleşimi olmadan: yanlar dışarı, taban derine kayar | Yoğun boyada Kes "Kesiliyor…"da kalıyordu | [x] |
| X66 | Worker iptali ve 120 s zaman aşımı; model ve geri alma durur | Takılan kesim arayüzü kilitliyordu | [x] |
| X67 | Yedek prizma birleşimi en çok 200 üçgen; üstü süpürme veya seyreltme | Üçgen başına manifold yoğun bölgede bitmiyordu | [x] |
| X68 | Komşuluk ve normaller geometri anahtarıyla önbellekte | Her kesimde 1M üçgende baştan kuruluyordu | [x] |
| X69 | Bluey e2e: boyalı 3MF kesilip 3MF iner | Büyük modelde kesim takılıyordu | [x] |
| X70 | cut.ts ve actions.ts konulara bölündü; dışarıdan aynı adlar | İki dosya ikişer bin satıra varmıştı | [x] |

## Sprint 7 — CatPin benzeri akış: boya, pin kendiliğinden gelsin

Gerekçe, hedef akış ve at modelinde bulunan hatalar: [docs/catpin-flow.md](catpin-flow.md). Sıra: X71, X72, X75, X73, X74, X76.

| # | İş | Neden | Durum |
| --- | --- | --- | --- |
| X71 | Model ölçüsü mm olarak yazar; 250 üstü / 8 altı uyarı; "Baskı boyu" ile ölçekle | At STL'i 34 mm geliyor, ölçü hiçbir yerde görünmüyor | [x] |
| X72 | Mod önerisi kalınlığı doğru ölçer; boya bitince öneriye geçer, elle seçim korunur | At başına "Tapa — kesit ~4 mm" öneriyor | [x] |
| X73 | Otomatik pin kesitin içinde ve kenardan uzak; sığmazsa konmaz; küçük ada pin almaz | At başında 4 pinin 4'ü dışarı taşıyor (%24–%90 içeride) | [ ] |
| X74 | Pimli kes'te boya değişince pin önizlemesi kendiliğinden; sürükle/ekle/sil varsayılan | Pin görmek için Önizleme'ye basmak gerekiyor | [ ] |
| X75 | Boyanın içindeki ayrı kabuklar ana parçaya katılır; kırıntı parça çıkmaz | At başı kesimi 2 kırıntı parça daha veriyor | [ ] |
| X76 | `e2e/horse-keys.spec.ts` geçer (HORSE_STL ile) | Akışın uçtan uca kanıtı | [ ] |

**İşaretler:** `[x]` bitti · `[~]` kısmen var · `[ ]` yapılacak

## Ana akış

Her iş bu akışı iyileştirdiği ölçüde önceliklidir:

```
Yükle + onar → Smart Fill / Fırça / Çizgi / Kova → Gap Fill, sınırı yumuşat → Önizleme (Space)
→ Socket (göz, kaş) veya Keys (kol, kafa) veya Fast → Kes (kaynak gizlenir) → sonraki bölge → Dışa aktar
```

## Sprint 5 — bağlantı kalitesi ve araştırmadan gelenler (sırayla)

Kaynak: benzer projeler taraması (OrcaSlicer/BambuStudio `CutUtils.cpp`, PrintSplit, geometry-central flip-geodesics). Kod kopyalanmaz (AGPL/GPL); yaklaşım yeniden yazılır.

| # | İş | Neden / kaynak | Durum |
| --- | --- | --- | --- |
| X31 | Pim toleransı yarıçap ve boy olarak ayrı: delik pimden daha derin, pim dibe oturmaz | Orca `radius_tolerance` / `height_tolerance` | [x] |
| X32 | Pim ucunda pah (konik uç): yuvaya kolay girer, uçta sarkma olmaz | Orca `CutConnectorStyle::Frustum` | [x] |
| X33 | Otomatik pim boyutu: kesit alanına göre yarıçap ve boy | PrintSplit (kesite göre ölçeklenen pim) | [x] |
| X34 | Yumuşatma fırçasında darbe bitince sınır üçgenlerin içinden geçsin (X30'un yerel hali) | Fırçada da düzgün kesim kenarı | [x] |
| X35 | Tolerans deneme parçası: seçili pim şekliyle 3 farklı boşlukta delik + pimler | Toleransı baskıdan önce denemek | [x] |
| X36 | Çizgi aracı: yüzeye nokta tıklayarak kapalı sınır çiz; yol yüzeyde en kısa yol, sonra yumuşatılıp üçgenlerin içinden işlenir | Doğal vadisi olmayan bölgeler; flip-geodesics fikri | [x] |
| X37 | Hata: küçük yarıçapla yumuşatırken model kayboluyor. Stres testinde (testa, 3000 darbe, r 0.15–1.35) köşe fırça yarıçapının 2–3 katı kaçıyordu; kayma 0.25·r ile sınırlandı, üst üste köşe (0/0) atlanıyor. Darbe sonunda geçersiz/kaçmış köşe varsa darbe geri alınır ve bildirilir; darbe içi geri almada ekran konumları da geri yazılıyor | Kullanıcı bildirdi | [x] |
| X38 | Büyük modelde (1.9M üçgen) yumuşatma darbesi sonunda ~2.9 s donma: bölmeden sonra ekran geometrisi, seçim ağacı ve komşuluk baştan kuruluyordu. Eklenen üçgenler ayrı yama mesh'te, ana geometri yerinde; seçim ağacında sadece değişen bölge; komşuluk ve yüz bilgisi yerinde güncelleniyor; renkler etiket başına önbellekli | Performans ölçümü | [x] |
| X39 | Türkçe Mac klavyesinde `[` `]` Option ile yazıldığı için fırça küçült/büyüt kısayolu çalışmıyordu (Alt'lı tuşlar yok sayılıyordu); harf/rakam olmayan Alt karakterleri artık kısayol | Türkçe klavye | [x] |
| X40 | Otomatik pim boyutunda pim işaretçisi ve pim ayarı elle girilen yarıçapı gösteriyordu; artık "Boyut: otomatik", tek pim için elle boyut ve "Otomatiğe dön" | X33 eksiği | [x] |
| X41 | Lint temizliği: `npm run lint` 70 hatayla kırmızıydı. Biçimlendirme uygulandı, gerçek bulgular düzeltildi (virgül operatörü, forEach dönüşü, yanlış "hook" adı `useSweepSocket`), projeye uymayan kurallar (`noVoidTypeReturn`, liste satırı a11y, CSS özgüllük sırası) `biome.json`da kapatıldı | Kod sağlığı | [x] |
| X42 | Yumuşatma fırçası her darbede tüm üçgenleri tarıyordu (1.9M üçgende darbe başına ~25 ms). Adaylar vurulan üçgenden yüzey üzerinde yayılarak bulunuyor (~12 ms); sonuç tam taramayla birebir aynı (test) | Performans | [x] |
| X43 | Uçtan uca test: çizgi aracı, tolerans deneme parçası, yardım ve görünürlük akışı | Yeni araçların arayüz testi yoktu | [x] |
| X44 | Çizgi aracında ayna: ayna açıksa karşı tarafta da aynı halka boyanır | Göz, yanak gibi çift bölgeler | [x] |
| X45 | Keys: uzun/yassı kesitte birden fazla otomatik pim (kesitin uzun ekseni boyunca) | Tek pim uzun kesitte dönmeye izin veriyor | [x] |
| X46 | Dışa aktarmada parçaları plakaya alan verimli yerleştirme (satır paketleme yerine raf/kutu paketleme, parçalar arası boşluk ayarı) | Çok parçalı figürlerde plaka taşması | [x] |
| X47 | Önizleme modu: açıkken modele tıklamak, pim eklemek/sürüklemek, ayar/slot/boyama değişikliği önizlemeyi kapatmaz, 300 ms sonra yeniler. Pim gövde payı (% gövdede; genel ve pim başına) | Kullanıcı istedi | [x] |
| X48 | Seçimi temizle: aktif slotun seçili parçadaki boyasını siler (düğme + Delete) | Kullanıcı istedi | [x] |
| X49 | Geçmiş zaman çizelgesi: adlandırılmış adımlar, tıklanan adıma gitme | Kullanıcı istedi | [x] |
| X50 | Kesim paneli sadeleştirme: pim şekli düğmelerle, yerleşim tek satır (otomatik / elle yerleştir / otomatiğe dön), tolerans sadece hazır ayarlar; sayısal ince ayarlar "Gelişmiş ayarlar" altında | Kullanıcı: pim arayüzü kafa karıştırıyor | [x] |
| X51 | Pim düzenleme (Fusion 360 benzeri): pimler gerçek boyutta yarı saydam; seçili pimde taşı (W, kesim düzleminde) / döndür (R) tutamağı, sürüklerken anlık; pime ekranda tıklayarak seçme, seçiliyken boşluğa tıklama seçimi bırakır; otomatik pime tıklayınca elle düzenlemeye geçer | Kullanıcı: yön/konum ayarı zor, tıklayınca yeni pim ekleniyor | [x] |
| X52 | Pim değişiklikleri geçmişte: ekle, sil, taşı, döndür, boyut, gövde payı, otomatiğe dön ayrı adımlar; sürükleme ve sayı kaydırma art arda (1 s içinde) tek adımda birleşir; Ctrl+Z ile geri alınır | Kullanıcı istedi | [x] |

Değerlendirilip alınmayan: pmp-library remesh (WASM derleme yükü; X30'un köşe eşiği ince üçgen oluşumunu zaten önlüyor), CGAL SDF segmentasyonu (lisans, boyut), three-bvh-csg (kapalı çıktı garanti etmiyor).

## Sprint 4 — kullanılabilirlik ve kesim kalitesi (bitti)

| # | İş | Neden | Durum |
| --- | --- | --- | --- |
| X26 | Yardım paneli (`?`): araçlar, fare hareketleri, kısayollar, iş akışı | Kullanıcı kısayolları unutunca bakacak yer istedi | [x] |
| X27 | Parça görünürlüğü: göz simgesi, yalnız bunu göster (Alt+tık), tümünü göster, `H` / `Shift+H`, patlatılmış görünüm | Kesilen parçaları ayrı ayrı incelemek | [x] |
| X28 | Tolerans: Clearance "Tolerans" adıyla, hazır ayarlar (sıkı 0.1 / normal 0.2 / gevşek 0.3 mm), ne işe yaradığı açık | Baskıda parça–yuva arası boşluk ayarı görünür olmalı | [x] |
| X29 | Arayüz düzeni: üst çubukta dosya/geri al/yardım, katlanır paneller, adım sırası | Daha derli toplu program görünümü | [x] |
| X30 | Sınırı üçgen içinden kesme: yumuşatılmış sınır üçgen kenarlarına bağlı kalmadan mesh'e işlenir (sıfır seviye çizgisi boyunca üçgen bölme) | testa'da kesim kenarı hâlâ tırtıklı | [x] |

## Sprint 3 — kalan özellikler (bitti)

| # | İş | Neden | Durum |
| --- | --- | --- | --- |
| B8 | Mirror boyama: simetri düzlemi (X/Y/Z + konum), boyama araçları aynı anda karşı tarafa da uygulanır | Göz, kulak, kaş gibi çift özellikler | [x] |
| X5 | Kesim modu önerisi: bölge kalınlığına göre Keys/Socket öner | Dokümandaki karar ağacı | [x] |
| D5 | Kesim hatasında sorunlu bölgeyi göster | Hata mesajı nereye bakılacağını söylemiyor | [x] |
| C12 | Link all: kapalıyken her ada kendi ayarıyla (derinlik) | Aynı slotta farklı boyda bölgeler | [x] |
| C11 | Snap pim (yapıştırıcısız, esnek dilli) | Faz 2 kalanı | [x] |
| E1 | Kamera: ters yakınlaştırma, Blender tarzı (orta tuş döndür) seçeneği | Faz 1 kalanı | [x] |
| B7 | X-ray boyama: arkadaki yüzleri de boya | Faz 3 | [x] |
| X9 | Boyalı 3MF içe aktarma (Bambu/Orca `paint_color`) | A1'in eksiği | [x] |
| X25 | Hata: yumuşatırken model yine kayboldu. Çekirdek 4500 rastgele darbede sağlam çıktı; kamera sınırsız yakınlaşıp modelin içine / uzak düzlemin ötesine gidebiliyordu. Kamera mesafe sınırı + dinamik kesme düzlemleri, Sığdır (Home, boşluğa çift tık), yumuşatmada geçersiz konum güvenlik ağı | Kullanıcı bildirdi | [x] |
| A2 | Voxel yedek onarım (kapanmayan mesh için) | A2'nin eksiği | [x] |
| E2 | Kısayolları özelleştirme | Faz 3 | [x] |
| C7 | Socket: tam yüzey / sadece iç kısım seçeneği | Faz 3 | [x] |
| C6 | Socket: Ring Selection | Faz 3 | [x] |
| X4 | Fast/Keys düzlem kesimi: seçenek olarak ve kapak üretilemezse otomatik | Eğri halkada kapak başarısız olabilir; kol/kulakta düz kesim yüzeyi istenebilir | [x] |
| B9 | Auto-paint: açılışta özellik önerisi | Faz 3 | [x] |

## Sprint 2 — seçim kalitesi ve sonrası (bitti)

| # | İş | Neden | Durum |
| --- | --- | --- | --- |
| X17 | Kamera: sağ sürükle her araçta döndürür, orta / Ctrl+sağ kaydırır | Fırça elindeyken model döndürülemiyordu | [x] |
| X18 | Vadiye oturtma: Smart Fill sonucu içbükeylik haritası üzerinde işaretleyicili havza ile çıkıntının dibine oturur; eksik seçim genişler, taşan seçim geri çekilir | Kaş gibi çıkıntılarda seçim dibe inmiyordu, kesim alanı garip çıkıyordu | [x] |
| X19 | Yumuşatma fırçası (S): sınırın üstünde gezdirilir; fırça altında işaretli uzaklık alanı 2G−G∘G ile yumuşatılır, sınır köşeleri sıfır çizgisine kayar. Bölge büzülmez | Tek tuşla tüm sınırı yumuşatmak yerine istenen yeri düzeltmek | [x] |
| X20 | Silgi aracı (E) | Fazla boyanan yeri silmek için ayrı araç (önce sadece Shift+fırça vardı) | [x] |
| X21 | Araç çubuğu (viewport solu) ve seçenek şeridi (üstte, seçili aracın ayarları) | Daha gerçek bir program düzeni | [x] |
| X22 | Sayı alanları: etiketi sürükle (Shift ince), kutuya yaz; fırça boyutu Alt+tekerlek ve [ ] | Kaydırıcıyla sayı tutturmak zordu | [x] |
| B6 | Tüm sınırı yumuşat (Yumuşat aracının şeridinde): sınır eğrisi Gauss ile düzleştirilir, alan dengesiyle büzülme telafi edilir, üçgenler eğrinin tarafına göre etiketlenir, sınır köşeleri eğriye çekilir. Tekrar basmak bölgeyi daraltmaz | İlk sürüm her basışta seçimi daraltıyordu, kenarlar girintili çıkıntılıydı | [x] |
| X23 | Hata: yumuşatma sırasında model kayboluyordu. Her darbe mesh'in tam kopyasını saklıyor ve ekran geometrisini baştan kuruyordu; uzun oturumda bellek dolup grafik bağlamı düşüyordu. Artık darbe mesh'i yerinde değiştirir, geri alma sadece değişen köşeleri tutar (60 darbede bellek artmıyor); bağlam düşerse uyarılır ve model yeniden çizilir | Kullanıcı bildirdi | [x] |
| X14 | Smart Fill ölçeğini tıklanan özelliğin boyutuna göre otomatik seçme (kulak 3 mm, göz 1.3 mm istedi) | Tek varsayılan her özellikte tutmuyor; kullanıcı ayarla uğraşmasın | [x] |
| A3 | 3MF'e Bambu/Orca filament ataması (`model_settings.config`) | Parçalar slicer'da ayrı filamentle açılsın | [x] |
| X16 | Pim başına boyut ve eksen (seçili pime gizmo) | Kol gibi eğik kesimlerde tek eksen yetmiyor (C8'in kalanı) | [x] |
| X6 | Pim/tapa duvar kalınlığı kontrolü, ince yeri önizlemede kırmızı gösterme | Baskıda kırılma riski | [x] |
| X7 | 1–2M üçgen performansı (yükleme, komşuluk, BVH) | 1.9M üçgen: onarım 6.1 → 0.6 s, komşuluk 1.4 → 0.19 s, otomatik ölçek 2.8 → 0.43 s; tarayıcıda yükleme 3.8 s, Smart Fill 0.15–0.56 s, Socket kesimi 6.5 s | [x] |
| X24 | Worker'da parçanın manifold'unu önbellekle (faceID = üçgen indeksi, etiketler sonradan eşlenir) | 1.9M: önizleme 2.5 → 1.1 s, kesim 6.5 → 5.1 s; boyama değişse de önbellek geçerli | [x] |
| X8 | Playwright smoke testi: yükle → Smart Fill → Socket → dışa aktar | Arayüz regresyonları elle yakalanıyor | [x] |

## Sprint 1 — ana akışın kalitesi (bitti)

| # | İş | Durum |
| --- | --- | --- |
| X1 | Fırça darbesinde boşluk kalmasın: hızlı sürüklemede iki nokta arası ara noktalarla doldurulsun | [x] |
| X2 | Mesh inceltme: seçili parçayı hedef kenar uzunluğuna kadar bölme; etiketler korunur. Düşük poligonlu modelde sınır tırtıklı çıkmasın | [x] |
| X11 | Smart Fill yoğun mesh'te tüm modele yayılıyordu: ölçekli açı karşılaştırması, "sadece çukur kenarda dur" modu, seçimdeki küçük deliklerin kapanması, yayılma uyarısı | [x] |
| X15 | Tırtıklı/kavisli sınırda kapak üretilemiyordu (kulak Keys, kaş Socket): izdüşümü kendini kesen halka yumuşatılıp gerekirse çembere eşlenerek üçgenlenir; pim kapağın alan merkezinde | [x] |
| X12 | Socket çıkıntılarda (burun, göz) hızlı ve sağlam: kapakla ayır + kapak prizması tapa; bölge içi delikler kesime katılır; yedek yöntem sadece sorunlu üçgenlerde prizma | [x] |
| C5 | Socket Squeeze: tapa tabanı içe daraltılır, yandan taşma önlenir | [x] |
| C4 | Socket yönü: önizlemede ok, gizmo ile döndürme; "kameradan al" ve "otomatik" | [x] |
| X3 | Pim düzenleme: pime tıklayıp silme, sürükleyip taşıma | [x] |
| A4 | Proje kaydetme / açma (`.3dsplit`): parçalar, etiketler, slotlar | [x] |

## Özellik listesi

### A. Model ve dosya

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| A1 | İçe aktarma: STL, OBJ, 3MF | 1 | [x] | 3MF: kendi okuyucu (Bambu/Orca bileşenleri, `paint_color` / `mmu_segmentation` boyası slotlara, filament renkleri) |
| A2 | Otomatik onarım | 1 | [x] | Kaynaştırma, dejenere/tekrar silme, yönelim, delik kapama; kapanmazsa otomatik voxel onarım; elle "Voxel onar" |
| A3 | Dışa aktarma: parça STL, çok nesneli 3MF, ZIP | 1 | [x] | "3MF": Bambu/Orca için renk başına filament numarası, plakaya dizili (Bambu Studio 2.8 CLI ile doğrulandı). Renkler dosyaya yazılamıyor, eşleme mesajla gösterilir. "3MF (genel)": düz |
| A4 | Proje kaydetme | 2 | [x] | `.3dsplit` (zip: project.json + ikili mesh); İçe aktar ile açılır. Undo geçmişi kaydedilmez |

### B. Seçim ve boyama

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| B1 | Renk slotları | 1 | [x] | |
| B2 | Smart Fill | 1 | [x] | Eşik + ölçek + çukur modu, Shift+sağ sürükle ile canlı ayar (X11) |
| B3 | Brush | 1 | [x] | Yüzey boyunca yayılır, Shift ile siler, darbe aralıkları doldurulur (X1) |
| B4 | Bucket Fill | 1 | [x] | |
| B5 | Gap Fill | 1 | [x] | |
| B6 | Smooth sınır | 2 | [x] | Eğri tabanlı, alan koruyan (`src/core/smooth.ts`). "Üçgenleri böl" kapalıyken sınır köşeleri eğriye kayar; açıkken X30 ile üçgenlerin içinden kesilir |
| B7 | Arka yüz / X-ray boyama | 3 | [x] | Fırça/Silgi seçeneği: model yarı saydam, küre içindeki tüm üçgenler |
| B8 | Mirror boyama | 3 | [x] | Smart Fill, Fırça, Silgi, Kova, Yumuşat; düzlem X/Y/Z, konum varsayılan parçanın ortası |
| B9 | Auto-paint | 3 | [x] | "Çıkıntıları öner": en tümsek noktalardan otomatik ölçekli Smart Fill, her çıkıntı yeni slota (testa: kulaklar, gözler, kaşlar, burun, ağız, çene) |

### C. Kesim

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| C1 | Önizleme (Space) | 1 | [x] | Önizlemede model yarı saydam |
| C2 | Fast | 1 | [x] | Sınır halkasından düz kapak; boolean yok |
| C3 | Socket: Depth | 1 | [x] | Düz yamada süpürme, çıkıntıda kapak prizması (X12), alttan oyuk bölgede süpürme + prizma |
| C4 | Socket: gizmo yönü | 2 | [x] | Ok + döndürme gizmosu, Kameradan, Oto. Elle yön çıkıntı yönteminde kapak izdüşümü olarak da kullanılır |
| C5 | Socket: Squeeze | 2 | [x] | Taban yüzde olarak daralır; yedek (prizma) yolunda uygulanmaz |
| C6 | Socket: Ring Selection | 3 | [x] | "Kesit şekli": tapa alt halkasının 8 yönlü radyal profili (sürüklenen tutamaçlar), önizlemede kontrol noktaları |
| C7 | Socket: full surface | 3 | [x] | "Ayak payı": 0 tam yüzey; artınca gövdeye giren ayak kenardan içeri çekilir, yuva çevresinde basamak kalır |
| C8 | Keys: pim yerleştirme | 1 | [x] | Tıkla ekle/seç, sürükle taşı, Shift+tık sil; seçili pime yarıçap/boy ve döndürme gizmosuyla eksen (X16) |
| C9 | Keys: clearance | 1 | [x] | |
| C10 | Keys: çoklu pim | 2 | [x] | Her tıklama bir pim |
| C11 | Keys: şekiller | 2 | [x] | Silindir, sekizgen, küp, snap (tırnak + yarık, yuvada oluk). Snap ölçüleri baskıyla ayarlanmalı |
| C12 | Link all | 2 | [x] | Socket'te kapalıyken bölge başına derinlik (ada anahtarı: en küçük üçgen numarası) |

### D. Parça yönetimi

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| D1 | Parça listesi | 1 | [x] | |
| D2 | Kaynak / yeni rozetleri | 1 | [x] | |
| D3 | Split | 1 | [x] | |
| D4 | Undo / redo | 2 | [x] | Boyama ve parça işlemleri |
| D5 | Hata bildirimi | 2 | [x] | Kesim başarısızsa durum değişmez, sorunlu bölgenin sınırı kırmızı çizilir; hacimsiz sonuç da hata sayılır |

### E. Kullanım

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| E1 | Kamera modları | 1 | [x] | Varsayılan (sağ döndür, orta kaydır) ve Blender (orta döndür, Shift+orta kaydır); ters yakınlaştırma; tarayıcıda hatırlanır |
| E2 | Özelleştirilebilir kısayollar | 3 | [x] | Sol panelde Kısayollar: araçlar, önizleme, sığdır, fırça boyu; çakışmada yer değiştirir, tarayıcıda hatırlanır. Sabit: Ctrl/Cmd+Z, 0–9, Alt+tekerlek |

## Tamamlananlar günlüğü

| Tarih | İş | Commit |
| --- | --- | --- |
| 2026-09-25 | Geometri çekirdeği: onarım, boyama algoritmaları, Fast/Socket/Keys, testler | `f67a4d8` |
| 2026-09-25 | MVP arayüzü: viewport, araçlar, kesim paneli, içe/dışa aktarma, Worker, undo/redo | `f29af18` |
| 2026-09-25 | Dokümanlar: yol haritası, mimari, çalışma kuralları | `3e32c28` |
| 2026-09-25 | X1: fırça darbesi ara noktaları | `1c1247b` |
| 2026-09-25 | X2: mesh inceltme | `4d01418` |
| 2026-09-25 | X11, X12: yoğun mesh'te Smart Fill, çıkıntı socket'i | `bfb879b` |
| 2026-09-25 | X15: kendini kesen kapak izdüşümleri, pim merkezi | `a2c5c3b` |
| 2026-09-25 | C5: Socket squeeze | `77b165f` |
| 2026-09-25 | X3: pim düzenleme | `7d8acdc` |
| 2026-09-25 | A4: proje kaydetme / açma | `1aad440` |
| 2026-09-25 | C4: Socket yönü | `29d25ba` |
| 2026-09-25 | Sprint 1 kapanışı | `eeea091` |
| 2026-09-25 | X17, X18, B6 ilk sürüm | `d80ab9d` |
| 2026-09-25 | B6: eğri tabanlı, alan koruyan yumuşatma | `eb362d1` |
| 2026-09-25 | X19–X22: yumuşatma fırçası, silgi, araç çubuğu, sayı alanları | `a9fba6f` |
| 2026-09-25 | X14: otomatik Smart Fill ölçeği | `8ea7024` |
| 2026-09-25 | A3: Bambu/Orca için filament atamalı 3MF | `bb62b3e` |
| 2026-09-25 | X23: yumuşatmada model kaybolması | `e33d261` |
| 2026-09-25 | X16: pim başına boyut ve eksen | `8137890` |
| 2026-09-25 | X6: ince duvar kontrolü | `41d6fa2` |
| 2026-09-25 | X7: 1–2M üçgen performansı | `4ca0cd5` |
| 2026-09-25 | X24: Worker manifold önbelleği | `4b2b740` |
| 2026-09-25 | X8: Playwright smoke testi | `ac8bc4e` |
| 2026-09-25 | B8: ayna boyama | `02b45c3` |
| 2026-09-25 | X5: kesim modu önerisi | `25769a5` |
| 2026-09-25 | D5: kesim hatasında sorunlu bölge | `56e121d` |
| 2026-09-25 | C12: Link all | `b2e94df` |
| 2026-09-25 | C11: snap pim | `ba96195` |
| 2026-09-25 | E1: kamera düzeni, ters yakınlaştırma | `52a2667` |
| 2026-09-25 | B7: X-ray boyama | `6da26d6` |
| 2026-09-25 | X9, X25: boyalı 3MF, kamera sınırları | `7e6ceb0` |
| 2026-09-25 | A2: voxel yedek onarım | `bdf60b0` |
| 2026-09-25 | E2: özelleştirilebilir kısayollar | `fae5279` |
| 2026-09-25 | C7: Socket ayak payı | `8e00bd2` |
| 2026-09-25 | B9: çıkıntıları otomatik öner | `bf0faa2` |
| 2026-09-25 | C6: tapa kesit şekli | `b7ae3cf` |
| 2026-09-25 | X31: pim toleransı yarıçap ve boy olarak ayrı | `05544fc` |
| 2026-09-25 | X32: pim ucunda pah | `b7ccce9` |
| 2026-09-25 | X37: yumuşatma fırçasında köşe kaçması ve model kaybolması için güvenlik ağı | `0b65033` |
| 2026-09-25 | X33: otomatik pim boyutu kesitten | `3a3fbe1` |
| 2026-09-25 | X34: yumuşatma fırçasında darbe izinde üçgen bölme, fark tabanlı geri alma | `365e082` |
| 2026-09-25 | X35: tolerans deneme parçası | `5c2fce4` |
| 2026-09-25 | X36: çizgi aracı: yüzeyde kapalı halka çizip boyama | `583bb53` |
| 2026-09-25 | X38: büyük modelde darbe sonu donması: yama mesh, kısmi seçim ağacı, yerinde komşuluk | `7be452e` |
| 2026-09-25 | X39: Türkçe Mac klavyesinde Option ile yazılan [ ] kısayolları | `7011f14` |
| 2026-09-25 | X40: otomatik pim boyutunda işaretçi ve pim ayarı | `42da70e` |
| 2026-09-25 | X41: lint temizliği ve biçimlendirme | `1d5bf39` |
| 2026-09-25 | X42: yumuşatma fırçasında yüzeyde yayılan aday üçgenler | `8709fae` |
| 2026-09-25 | X43: uçtan uca test: çizgi aracı, deneme parçası, ayrık görünüm | `723e41f` |
| 2026-09-25 | X44: çizgi aracında ayna | `b43441e` |
| 2026-09-25 | X45: uzun kesitte birden fazla otomatik pim | `5a1b674` |
| 2026-09-25 | X46: plaka yerleştirme: en küçük izdüşüm dönüşü ve raf paketleme | `cc0d128` |
| 2026-09-26 | X47–X49: kalıcı önizleme + pim gövde payı, seçimi temizle, geçmiş | `61d7d8a` |
| 2026-09-25 | X50: kesim paneli sadeleştirme | `6c0b5d7` |
| 2026-09-25 | X51: pim düzenleme: gerçek boyutlu görüntü, taşı/döndür tutamağı, seçme davranışı | `2070559` |
| 2026-09-25 | X52: pim değişiklikleri geçmişte | `a72bddd` |
| 2026-09-25 | Sprint 4: yardım, parça görünürlüğü/ayrık görünüm, tolerans, üst çubuk (X26–X29), sınırı üçgen içinden kesme (X30) | `c36ac31` + sonraki |
| 2026-10-18 | X56: dikiş kesimi, kapalı halkadan iki parça | — |
| 2026-10-20 | X65: tapa yuvası payı kopya birleşimi olmadan | — |
| 2026-10-20 | X66: worker iptali ve zaman aşımı | — |
| 2026-10-20 | X67: yedek prizma sınırı 200; seyrek küre ölçümü ~1 s | — |
| 2026-10-20 | X68: 1.89M üçgende komşuluk 239 ms, aynı mesh'te ikinci kez 0 ms | — |
| 2026-10-20 | X69: Bluey 500k, 1.3 dk. Siyah ve turuncu tapa, Renk 2 pimli kesildi; Renk 3 düzlem kesimi parça üretemedi (`düzlem bölgenin arkasında`); beyaz gövde bırakıldı; 3MF indi. Sayfa hatası yok | — |
| 2026-10-20 | X70: kesim ve eylemler konulara bölündü. npm test 94 geçti, 4 atlandı (4.6 s); tsc temiz; vite build 296 ms; e2e 8 geçti (2.2 dk) | — |
| 2026-10-20 | X71: parça satırında en uzun kenar mm; 250 üstü / 8 altı sarı uyarı; "Baskı boyu" + Ölçekle bütün parçaları ortak merkezde ölçekler, Ctrl+Z geri alır, pim ve önizleme sıfırlanır. npm test 97 geçti; e2e 9 geçti; Chrome'da `print-size.spec.ts` geçti | 4be87ab |
| 2026-10-20 | X72: öneri halka alanına değil bölgenin hacim/yüzeyine bakar: kapak < yüzey × 0,3 (çıkıntı) ve kalınlık 3V/A ≥ 3 mm ise Pimli kes. At başı: halkalar yalnız kulak dipleri (15 mm²), kalınlık 5,2 mm → Pimli kes. Boya bitince mod öneriye geçer; araç şeridinden elle seçilince geçmez (yeni model açılınca sıfırlanır). npm test 102 geçti; e2e 10 geçti; at e2e'si öneriyi geçip X74 adımında duruyor | fe889e9 |
