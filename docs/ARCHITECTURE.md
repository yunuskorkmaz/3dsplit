# Mimari

Tamamen tarayıcıda çalışan TypeScript uygulaması. Dosyalar sunucuya gitmez.

## Katmanlar

```
src/ui        React paneller (sadece arayüz)
   │  store'u okur, actions çağırır
src/state     Zustand store, actions, undo/redo, topoloji önbelleği
   │                         │
src/viewport  Three.js       src/worker   Comlink ile Web Worker
   (çizim, seçim, BVH)          │  ağır işler: onarım, boolean, kesim
                             src/core     saf geometri çekirdeği (manifold-3d)
src/io        STL/OBJ/3MF içe aktarma, STL/3MF/ZIP dışa aktarma
```

**Kurallar**

- `src/core` DOM, React veya Three.js'e bağlı değil. Node'da test edilir, Worker'da çalışır. Tauri'ye geçişte aynen taşınır.
- Boyama ana thread'de, etiket dizisi üzerinde yerinde çalışır. Kesim, onarım ve bölme Worker'da çalışır.
- Viewport React'ten bağımsız bir sınıftır (`Viewport`). React sadece `sync` ile parça listesini verir.

## Veri modeli

- `LabeledMesh`: `positions: Float32Array`, `indices: Uint32Array` (CCW, dışa bakan), `labels: Uint16Array` (üçgen başına slot).
- Slot `0` taban (boyanmamış).
- `Part`: store'daki parça; `mesh`, `visible`, `badge` (`source` / `new`), `colorSlot`.
- Mesh'ler değiştirilemez kabul edilir; istisnalar: `labels` boyamada, `positions` yumuşatma fırçasında yerinde değişir (geri alma kaydı değişen öğeleri tutar). Undo boyamada değişen üçgenlerin önceki/sonraki etiketini, kesimde parça listesinin önceki halini saklar.
- Kesimde manifold `faceID` = orijinal üçgen numarası; sonuçtaki etiketler `labels[faceID]` ile eşlenir (`fromManifoldMapped`). Kesimle oluşan yeni yüzler `CUT_FACE_ID` (0x7ffffffe) alır ve parçanın slotuna veya tabana çevrilir. `0xffffffff` kullanılamaz: manifold onu "faceID yok" sayıyor. Manifold etiketlerden bağımsız olduğu için Worker parçanın manifold'unu geometri anahtarıyla (mesh kimliği + konum sürümü) önbellekler; boyama değişse de yeniden kurulmaz.

## Kesim algoritmaları (`src/core/cut.ts`)

Bölge = seçili slottaki üçgenler; bağlı her ada ayrı işlenir.

**Fast / Keys: kapakla ayırma.** Adanın her sınır halkası kendi Newell düzlemine izdüşürülüp `manifold.triangulate` ile üçgenlenir. İzdüşümde üst üste düşen köşeler önce atılır, sonra ait oldukları kenarın üçgenine yelpaze olarak geri eklenir. Parça = ada + kapaklar, gövde = geri kalan + ters kapaklar. Boolean yok; sonuç manifold'da doğrulanır.

**Keys pimi.** Pim ekseni kapak normali, merkezi kapak yüzeyi üzerindeki nokta (kapak üçgenleriyle doğru kesişimi). `parça ∪ pim`, `gövde − büyütülmüş(pim, clearance)`. Pim modelin dışına taşıyorsa uyarı verilir.

**Socket.** Önce bölgenin yapısına göre yol seçilir:

1. *Süpürme* (düz/sığ yamalar, ya da yön elle verildiyse): yön `d` = bölge normallerinin alan ağırlıklı ortalaması. Ada yüzeyi `+eps·d`'den `−depth·d`'ye süpürülerek kapalı hacim `V` üretilir. `tapa = model ∩ V`, `gövde = model − büyüt(V)`.
2. *Çıkıntı* (burun, göz; bölge tek yönden tam görünmüyorsa): bölge Fast gibi kapakla ayrılır. Her kapak kendi düzleminde üçgenlendiği için yükseklik alanıdır; kapak normali boyunca `depth` kadar gövdeye süpürülür (`V`). `tapa = çıkıntı ∪ (V ∩ model)`, `gövde = kapaklı gövde − büyüt(V)`. Halka kendi düzleminde katlanırsa bölgenin ortalama normali ile tekrar denenir.
3. *Yedek* (alttan oyuk bölgeler, ör. kaş): `d`'ye bakan üçgenler tek parça süpürülür, bakmayanlar için üçgen başına prizma eklenir.

Büyütme (clearance): `V`'nin yana 8 yönde ve `−d` yönünde clearance kadar kaydırılmış kopyalarının birleşimi. Kesilen parçadaki taban etiketli yüzler parçanın slotunu alır.

**Bölge hazırlığı (her mod).** Adanın içinde kalan, adadan küçük boyanmamış alanlar (delikler) kesime katılır. 1 mm²'den küçük, köşeden bağlı kırıntı adalar atlanır.

**Duvar kontrolü (X6, önizlemede).** Her yuva (pim yuvası veya tapa yuvası) clearance + en az duvar kadar büyütülür, yuvanın yüzeye açılan ağzı kesim yüzeyinin `minWall + halkanın düzlemden sapması` altından kırpılır, kalan kısım yuvayı içeren katıdan çıkarılır. Artan hacim duvarın ince kaldığı yerdir; önizlemede kırmızı çizilir ve uyarı verilir.

**Kesim modu önerisi (X5, `suggestCutMode`).** En büyük adanın kesim halkası alanından eşdeğer yarıçap r, bölge + düz kapak hacminden ortalama çıkıntı yüksekliği h = hacim / kesit hesaplanır. r ≥ 4 mm ve h ≥ 0.8·r ise Keys (kulak, kol, kafa), değilse Socket (göz, kaş, burun). Boyama durulunca Worker'da hesaplanır, kesim panelinde "Uygula" ile seçilir.

## Smart Fill (`src/core/paint.ts`)

Tohum üçgenden BFS. Aday üçgenin normali, yolda `ölçek` mm geride kalan atasının normaliyle karşılaştırılır; komşu üçgen karşılaştırması yoğun mesh'te kıvrım birçok üçgene yayıldığı için eşiği hiç aşmıyor. "Sadece çukur kenarda dur" modunda eşiği aşan kıvrım, yerel kenar içbükeyse durdurur; tümsek tepelerinden geçilir (göz, kaş, burun gibi çıkıntılar tek tıkla seçilir). Ölçek otomatikte tıklanan özelliğe göre seçilir (X14): ortalama kenarın 3, 4, 6, 8, 12, 16 katı sırayla denenir; modelin %40'ından azını kaplayan ve sonraki iki ölçekten biriyle ±%25 benzer alan veren ilk ölçek alınır (testa.stl: göz/kaş/burun 1.3 mm, kulak 3.4 mm). Sonuçtaki küçük, aynı etiketli delikler kapatılır.

**Vadiye oturtma.** Üçgen başına içbükeylik (köşe Laplace vektörünün normal bileşeni, ölçek kadar difüzyonla yumuşatılmış; pozitif = çukur) hesaplanır. Smart Fill sonucunun sınırından `2 × ölçek` içindeki üçgenler belirsiz sayılır; seçimin derini ve dışarının uzağı işaretleyicidir. İki havza içbükeylik değerine göre düşükten yükseğe taşar ve vadi çizgisinde (içbükeyliğin en yüksek olduğu yerde) buluşur. Sonra sadece tıklanan noktanın bağlı olduğu parça tutulur.

**Sınırı yumuşat (B6, `src/core/smooth.ts`).** Bölgenin sınır halkaları çıkarılır ve yay uzunluğu boyunca Gauss çekirdeğiyle (σ = yarıçap) düzgün bir eğriye çevrilir. Eğrinin `1.5 × yarıçap` yakınındaki her üçgen, eğriye işaretli uzaklığına göre (halka yönünde bölge solda) içe ya da dışa atanır. Gauss eğriyi büzdüğü için sınır, bölge alanı eskisine eşit olacak kadar dışa kaydırılır (alan dengesi); bu yüzden tekrar basmak bölgeyi daraltmaz. Kırıntılar ve delikler temizlenir, ardından yeni sınır köşeleri yüzey üzerinde (teğet düzlemde) eğriye çekilir; üçgeni ters çeviren veya %30'un altına incelten hareket geri alınır. Mesh konumları değiştiği için parça yeni mesh ile değiştirilir.

**Yumuşatma fırçası (`smoothBoundaryAt`).** Fırça altındaki köşelere sınıra işaretli uzaklık verilir (içeride +). Alan yerel komşuluk grafiğinde 2G − G∘G süzgeciyle yumuşatılır (G: σ = yarıçap/2 Gauss; bu süzgeç büyük ölçekli biçimi koruduğu için bölge büzülmez), fırça merkezinden kenara azalan ağırlıkla karıştırılır. Üçgenler yeni alanın işaretine göre etiketlenir; sınır köşeleri alanın eğimi boyunca sıfır noktasına kaydırılır. Darbe boyunca parçanın mesh'i yerinde değişir (kopya yok), viewport sadece değişen üçgenleri günceller; darbe sonunda değişen köşe ve üçgenlerin önceki/sonraki değerleri tek bir `geometry` geri alma kaydına yazılır. Tam kopya saklamak uzun oturumlarda belleği doldurup grafik bağlamını düşürüyordu (X23).

## Arayüz

- Viewport'un solunda araç çubuğu (Smart Fill F, Fırça B, Silgi E, Yumuşat S, Kova G, Pim P), üstünde seçili aracın ayar şeridi.
- Sayı alanları (`src/ui/fields.tsx`): etiketi sürükleyerek değiştirilir (Shift ince ayar), kutuya yazılabilir; geniş aralıklı değerler oransal (log) değişir.
- Kamera: sağ sürükle döndür, orta / Ctrl+sağ kaydır, tekerlek yakınlaştır, Alt+tekerlek fırça boyutu.

## Dışa aktarma (`src/io`)

- **3MF (Bambu/Orca)** (`bambu3mf.ts`): Bambu Studio'nun kendi proje yapısı (her parça `3D/Objects/object_N.model`, ana modelde bileşen), parça başına `extruder` numarası `Metadata/model_settings.config` içinde; aynı renk aynı numara. Parçalar tabanı z=0 olacak şekilde plakaya dizilir. Alt dosyalardaki nesne kimlikleri benzersiz olmalı (aynı olursa Bambu tüm parçaları tek mesh sanıyor). `project_settings.config` yazılmaz ve dosya Bambu projesi olarak etiketlenmez: eksik ön ayarlı Bambu projesi Bambu Studio'yu çökertiyor. Bambu Studio 2.8 komut satırıyla yüklenip yeniden dışa aktarılarak doğrulandı: adlar ve filament numaraları korunuyor.
- **3MF (genel)**, **STL (ZIP)**, parça başına STL.

## Onarım (`src/core/repair.ts`)

Köşe kaynaştırma → dejenere ve tekrarlı üçgen silme → yönelimi BFS ile eşitleme, bileşeni dışa baktırma → açık halkaları merkezden yelpazeyle kapama → manifold doğrulaması. Doğrulamadan geçmezse voxel yedek onarım (`src/core/voxelRepair.ts`) devreye girer: yüzey ızgaraya işlenir, kapama yarıçapı (1–16 voksel) iç hacim oluşana kadar büyütülerek delikler kapatılır, dışarı taşırılıp içerisi bulunur; yüzeye yakın noktalarda uzaklık ve işaret en yakın orijinal üçgenden (mevcut yüzey korunur), delik bölgesinde voksel alanından alınır. `levelSet` ile kapalı yüzey çıkarılır, voksel yarısı kadar sapmayla sadeleştirilir, etiketler en yakın eski üçgenden aktarılır. Bu da başarısız olursa parça `!` rozetiyle işaretlenir.

## Performans

- Büyük tablolar (köşe kaynaştırma, kenar komşuluğu, tekrar üçgen) `src/core/hashTable.ts` içindeki tipli dizili hash tablosuyla; `Map<string, …>` kullanılmaz.
- Onarımda komşuluk bir kez hesaplanır; yönelim düzeltmede çevrilen üçgenlerin girişleri yerinde yeniden eşlenir.
- Smart Fill iç döngüsünde kareli uzaklık; otomatik ölçek denemeleri taşma sınırını geçince bırakılır.
- Ölçüm: `PERF=1 npx vitest run test/perf.test.ts` (samples/testa.stl'den 1.9M üçgenlik model üretir).

## Test

- `npm test`: `test/` altında Vitest, çekirdek fonksiyonlar Node'da manifold-3d ile.
- `npm run e2e`: `e2e/smoke.spec.ts`, Playwright + yazılım WebGL (SwiftShader); figür modelini yükler, Smart Fill ile seçer, Socket keser, 3MF indirir, sayfa hatası olmamalı.
- `test/testa-model.test.ts`: gerçek model testi; `samples/testa.stl` (repoda yok) varsa çalışır, yoksa atlanır.
- Görsel kontrol elle: `node samples/make-figure.mjs` ile test figürü üretilir.
