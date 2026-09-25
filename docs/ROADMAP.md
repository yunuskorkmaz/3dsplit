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

## Şimdiki sprint — Sprint 1: ana akışın kalitesi

| # | İş | Durum |
| --- | --- | --- |
| X1 | Fırça darbesinde boşluk kalmasın: hızlı sürüklemede iki nokta arası ara noktalarla doldurulsun | [ ] |
| X2 | Mesh inceltme: seçili parçayı hedef kenar uzunluğuna kadar bölme; etiketler korunur. Düşük poligonlu modelde sınır tırtıklı çıkmasın | [ ] |
| C5 | Socket Squeeze: tapa tabanı içe daraltılır, yandan taşma önlenir | [ ] |
| C4 | Socket yönü: önizlemede ok, gizmo ile döndürme; "kameradan al" ve "otomatik" | [ ] |
| X3 | Pim düzenleme: pime tıklayıp silme, sürükleyip taşıma | [ ] |
| A4 | Proje kaydetme / açma (`.3dsplit`): parçalar, etiketler, slotlar | [ ] |

## Özellik listesi

### A. Model ve dosya

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| A1 | İçe aktarma: STL, OBJ, 3MF | 1 | [~] | Boyalı 3MF renkleri (Bambu `paint_color`) içe alınmıyor |
| A2 | Otomatik onarım | 1 | [~] | Kaynaştırma, dejenere/tekrar silme, yönelim, delik kapama var. Voxel yedek onarım yok |
| A3 | Dışa aktarma: parça STL, çok nesneli 3MF, ZIP | 1 | [~] | Bambu/Orca filament ataması (`model_settings.config`) yazılmıyor |
| A4 | Proje kaydetme | 2 | [ ] | Sprint 1 |

### B. Seçim ve boyama

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| B1 | Renk slotları | 1 | [x] | |
| B2 | Smart Fill | 1 | [x] | Eşik kaydırıcı + Shift+sağ sürükle, canlı güncelleme |
| B3 | Brush | 1 | [~] | Yüzey boyunca yayılır, Shift ile siler. Hızlı sürüklemede boşluk (X1) |
| B4 | Bucket Fill | 1 | [x] | |
| B5 | Gap Fill | 1 | [x] | |
| B6 | Smooth sınır | 2 | [ ] | Önce X2 (inceltme) + çoğunluk oylaması |
| B7 | Arka yüz / X-ray boyama | 3 | [ ] | |
| B8 | Mirror boyama | 3 | [ ] | |
| B9 | Auto-paint | 3 | [ ] | |

### C. Kesim

| # | Özellik | Faz | Durum | Not |
| --- | --- | --- | --- | --- |
| C1 | Önizleme (Space) | 1 | [x] | Önizlemede model yarı saydam |
| C2 | Fast | 1 | [x] | Sınır halkasından düz kapak; boolean yok |
| C3 | Socket: Depth | 1 | [x] | Yön boyunca süpürme; yükseklik alanı değilse prizma birleşimi (yavaş) |
| C4 | Socket: gizmo yönü | 2 | [ ] | Sprint 1 |
| C5 | Socket: Squeeze | 2 | [ ] | Sprint 1 |
| C6 | Socket: Ring Selection | 3 | [ ] | |
| C7 | Socket: full surface | 3 | [ ] | |
| C8 | Keys: pim yerleştirme | 1 | [~] | Tıklayarak konuyor, kapak yüzeyine izdüşüyor. Taşıma/silme yok (X3), gizmo yok |
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
| E1 | Kamera modları | 1 | [~] | Orbit, Alt ile döndürme var. Blender tarzı / ters zoom yok |
| E2 | Özelleştirilebilir kısayollar | 3 | [~] | Sabit kısayollar var (F, B, G, 0–9, Space, [ ]) |

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
