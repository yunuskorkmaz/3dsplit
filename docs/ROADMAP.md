# Yol Haritası ve İş Listesi

Uygulamanın amacı: modelde göz, kaş, kol gibi bir bölgeyi Smart Fill ile seçmek, eksik kalan yerleri fırçayla düzeltmek, sonra o bölgeyi ana modelden **Socket** (tapa + yuva) veya **Keys** (pim + yuva) ile ayırıp ayrı basılabilir parça yapmak.

Özellik numaraları [proje dokümanındaki](project-brief.md) tabloya karşılık gelir. Ek işler `X` ile numaralanır.

**İşaretler:** `[x]` bitti · `[~]` kısmen var · `[ ]` yapılacak

## Ana akış

Her iş bu akışı iyileştirdiği ölçüde önceliklidir:

```
Yükle + onar → Smart Fill ile seç → Fırça/Kova ile düzelt → Gap Fill → Önizleme (Space)
→ Socket (göz, kaş) veya Keys (kol, kafa) → Kes → yeni parçada sonraki bölge → Dışa aktar
```

## Sprint 2 — seçim kalitesi ve sonrası (sırayla)

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
| A1 | İçe aktarma: STL, OBJ, 3MF | 1 | [~] | Boyalı 3MF renkleri (Bambu `paint_color`) içe alınmıyor |
| A2 | Otomatik onarım | 1 | [~] | Kaynaştırma, dejenere/tekrar silme, yönelim, delik kapama var. Voxel yedek onarım yok |
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
| B6 | Smooth sınır | 2 | [x] | Eğri tabanlı, alan koruyan (`src/core/smooth.ts`). Üçgenler kesilmez; sınır köşeleri eğriye kaydırılır |
| B7 | Arka yüz / X-ray boyama | 3 | [ ] | |
| B8 | Mirror boyama | 3 | [ ] | |
| B9 | Auto-paint | 3 | [ ] | |

### C. Kesim

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| C1 | Önizleme (Space) | 1 | [x] | Önizlemede model yarı saydam |
| C2 | Fast | 1 | [x] | Sınır halkasından düz kapak; boolean yok |
| C3 | Socket: Depth | 1 | [x] | Düz yamada süpürme, çıkıntıda kapak prizması (X12), alttan oyuk bölgede süpürme + prizma |
| C4 | Socket: gizmo yönü | 2 | [x] | Ok + döndürme gizmosu, Kameradan, Oto. Elle yön çıkıntı yönteminde kapak izdüşümü olarak da kullanılır |
| C5 | Socket: Squeeze | 2 | [x] | Taban yüzde olarak daralır; yedek (prizma) yolunda uygulanmaz |
| C6 | Socket: Ring Selection | 3 | [ ] | |
| C7 | Socket: full surface | 3 | [ ] | |
| C8 | Keys: pim yerleştirme | 1 | [x] | Tıkla ekle/seç, sürükle taşı, Shift+tık sil; seçili pime yarıçap/boy ve döndürme gizmosuyla eksen (X16) |
| C9 | Keys: clearance | 1 | [x] | |
| C10 | Keys: çoklu pim | 2 | [x] | Her tıklama bir pim |
| C11 | Keys: şekiller | 2 | [~] | Silindir, sekizgen, küp var; snap pim yok |
| C12 | Link all | 2 | [ ] | Şu an tüm adalar aynı ayarı kullanıyor |

### D. Parça yönetimi

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| D1 | Parça listesi | 1 | [x] | |
| D2 | Kaynak / yeni rozetleri | 1 | [x] | |
| D3 | Split | 1 | [x] | |
| D4 | Undo / redo | 2 | [x] | Boyama ve parça işlemleri |
| D5 | Hata bildirimi | 2 | [~] | Mesajlar var; kesim başarısızsa durum değişmiyor. Hatalı bölgeyi gösterme yok |

### E. Kullanım

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| E1 | Kamera modları | 1 | [~] | Sağ sürükle döndür, orta/Ctrl+sağ kaydır, Alt+sol döndür (X17). Blender tarzı / ters zoom yok |
| E2 | Özelleştirilebilir kısayollar | 3 | [~] | Sabit kısayollar: F, B, E, S, G, P, 0–9, Space, [ ], Alt+tekerlek |

## Sonraki sprintler için bekleyen ek işler

| # | İş | Neden |
| --- | --- | --- |
| X4 | Keys için düzlemsel kesim yedeği: sınır halkası çok eğriyse en uygun düzlemle kes | Eğri halkada kapak kendini kesebilir |
| X5 | Kesim modu önerisi: bölge kalınlığına göre Keys/Socket öner | Dokümandaki karar ağacı |
| X6 | Pim yerleştirmede duvar kalınlığı kontrolü, uyarıyı pim üzerinde göster | İnce duvarda kırılma riski |
| X7 | 1–2M üçgen performansı: komşuluk ve kaynaştırma için Map yerine sıralama tabanlı yapı | Büyük modellerde yavaşlık |
| X8 | Playwright smoke testi | Arayüz regresyonları |
| X9 | Boyalı 3MF içe aktarma (Bambu/Orca `paint_color`) | A1'in eksiği |

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
