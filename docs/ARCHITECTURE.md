# Mimari

Tamamen tarayıcıda çalışan TypeScript uygulaması. Dosyalar sunucuya gitmez.

Amaç ve özellik kimlikleri `docs/project-brief.md`, iş durumu `docs/ROADMAP.md`. Kesim ve boyama yolu bu dosyadadır; kodla çelişirse `src/core` esas alınır.

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
- Boyama ana thread'de, etiket dizisi üzerinde yerinde çalışır. Kesim, onarım ve bölme Worker'da çalışır. Uzun çağrı 120 saniyede bitmezse veya kullanıcı İptal / Esc derse worker kapatılıp yeniden kurulur; model ve geri alma yığını değişmez (X66). Komşuluk ve normaller geometri anahtarıyla saklanır; aynı parçada ikinci kesim onları yeniden kurmaz (X68).
- Viewport React'ten bağımsız bir sınıftır (`Viewport`). React sadece `sync` ile parça listesini verir. Görüntü indekssizdir (üçgen başına renk). Köşe normali komşu yüzlerden gelir; aralarındaki açı 60°'yi geçerse kenar keskin kalır. Kesimle oluşan yüz (`cut`) heykel yüzeyiyle normal paylaşmaz. Üçgen sayısı bu gölgeden değişmez.

## Veri modeli

- `LabeledMesh`: `positions: Float32Array`, `indices: Uint32Array` (CCW, dışa bakan), `labels: Uint16Array` (üçgen başına slot).
- Slot `0` taban (boyanmamış).
- `Part`: store'daki parça; `mesh`, `visible`, `badge` (`source` / `new`), `colorSlot`.
- Mesh'ler değiştirilemez kabul edilir; istisnalar: `labels` boyamada, `positions` yumuşatma fırçasında yerinde değişir (geri alma kaydı değişen öğeleri tutar). Undo boyamada değişen üçgenlerin önceki/sonraki etiketini, kesimde parça listesinin önceki halini saklar.
- Kesimde manifold `faceID` = orijinal üçgen numarası; sonuçtaki etiketler `labels[faceID]` ile eşlenir (`fromManifoldMapped`). Kesimle oluşan yeni yüzler `CUT_FACE_ID` (0x7ffffffe) alır, parçanın slotuna veya tabana çevrilir ve `cut` bayrağıyla işaretlenir. Bu bayrak gölgede heykel yüzeyinden ayrılır. `0xffffffff` kullanılamaz: manifold onu "faceID yok" sayıyor. Manifold etiketlerden bağımsız olduğu için Worker parçanın manifold'unu geometri anahtarıyla (mesh kimliği + konum sürümü) önbellekler; boyama değişse de yeniden kurulmaz.

## Kesim algoritmaları

`src/core/cut.ts` ince bir giriş: tipler `cutTypes.ts`, kapak üçgenleme `cutCap.ts`, tapa `cutSocket.ts`, pimler `cutPins.ts`, düzlem ve dikiş `cutSeam.ts`, kesim akışı `cutRun.ts`. Arayüz eylemleri de konulara bölünür (`actionsFile`, `actionsPaint`, `actionsSmooth`, `actionsPins`, `actionsCut`, `actionsLine`, `actionsParts`, `actionsHistory`, `actionsHooks`); `actions.ts` bunları dışa aktarır.

Bölge = seçili slottaki üçgenler; bağlı her ada ayrı işlenir.

**Fast / Keys: kapakla ayırma.** Adanın her sınır halkası kendi Newell düzlemine izdüşürülüp `manifold.triangulate` ile üçgenlenir. İzdüşümde üst üste düşen köşeler önce atılır, sonra ait oldukları kenarın üçgenine yelpaze olarak geri eklenir. Parça = ada + kapaklar, gövde = geri kalan + ters kapaklar. Boolean yok; sonuç manifold'da doğrulanır. `planar` açıksa ya da kapak üretilemezse (X4) her ada aynı düzlemle kesilir: düzlemin bölge tarafı büyük bir kutuyla alınır, gövde modelden bu parçaların çıkarılmasıdır.

**Dikiş (X56, X63).** Çizgi aracından ayrıdır: kapalı yüzey halkasının içi boyanmaz. Halka Newell düzlemine yakınsa ve düzlem katıyı tek yerden kesiyorsa model o düzlemle iki kapalı parçaya ayrılır. Düzlem tutmazsa, halka yüzeyi iki bölgeye ayırıyorsa kesim çizilen kenarı izler ve kapağı o halkadan üretir. İkisi de olmazsa kesim durur ve halka kırmızı çizilir. Pimli kes seçiliyse mevcut pim şekli, tolerans, pah ve taraf o yüze uygulanır; değilse pimsiz iki parça olur. Düz kesimde `faceGap` kadar malzeme iki yüzün arasından düşer; eğri kesitte bu boşluk uygulanmaz. Göz ve kaş yine Socket'tir.

**Keys pimi.** Pim ekseni kapak normali, merkezi kapak yüzeyi üzerindeki nokta (kapak üçgenleriyle doğru kesişimi). `onPart` açıksa (varsayılan) `parça ∪ pim` ve `gövde − delik`; kapalıysa pim gövdede kalır, delik kesilen parçadadır. Delik, yarıçapta `clearance`, boyda ayrıca `depthClearance` kadar büyüktür (pim dibe oturmaz). Uçta pah vardır; snap pimde pah yok. Boyut otomatikse yarıçap kesit payından, boy yarıçapın yaklaşık 4 katıdır; uzun kesitte pimler uzun eksen boyunca dizilir. Pim boyunun gövde tarafındaki payı `bodyRatio` (varsayılan 0.5). Pim modelin dışına taşıyorsa uyarı verilir.

**Socket.** Önce bölgenin yapısına göre yol seçilir:

1. *Süpürme* (bölgenin her üçgeni `d` yönüne bakıyorsa, yani düz/sığ yama): `d` elle verilmiş yön, yoksa bölge normallerinin alan ağırlıklı ortalaması. Ada yüzeyi `+eps·d`'den `−depth·d`'ye süpürülerek kapalı hacim `V` üretilir. `tapa = model ∩ V`, `gövde = model − büyüt(V)`.
2. *Çıkıntı* (burun, göz; bölge tek yönden tam görünmüyorsa): bölge Fast gibi kapakla ayrılır. Her kapak kendi düzleminde üçgenlendiği için yükseklik alanıdır; kapak normali boyunca `depth` kadar gövdeye süpürülür (`V`). `tapa = çıkıntı ∪ (V ∩ model)`, `gövde = kapaklı gövde − büyüt(V)`. Halka kendi düzleminde katlanırsa bölgenin ortalama normali ile tekrar denenir.
3. *Yedek* (alttan oyuk bölgeler, ör. kaş): `d`'ye bakan üçgenler tek parça süpürülür, bakmayanlar için üçgen başına prizma eklenir. Prizma sayısı 200'ü geçerse süpürme zorlanır; o da olmazsa en büyük 200 üçgen kalır. İkisi de hacim vermezse kesim "bölge çok yoğun" der (X67).

**Squeeze (C5).** Tapa tabanı merkeze `squeeze` oranında (0–0.9) daraltılır. Yedek prizma yolunda uygulanmaz.

**Kesit şekli (C6).** `ringProfile`: tapa alt halkasının 8 yönlü radyal ofseti (mm; 0°–315°, araları kosinüsle). Önizlemede tutamaçlar. Sağ tıkla tek bir halka seçilmez.

**Ayak payı (C7).** `inset` mm. 0 tam yüzey. Artınca gövdeye giren ayak kenardan içeri çekilir; yuva çevresinde basamak kalır. Düz yamada görünen tapa da daralır.

**Link all (C12).** Açıksa her ada aynı `depth` kullanır. Kapalıysa Socket'te ada anahtarı (en küçük üçgen numarası) başına derinlik; diğer ayarlar ortak kalır.

Büyütme (clearance, X65): yan yüzler clearance kadar dışarı, en derin taban clearance kadar içeri kayar. Kaydırılmış kopyaların birleşimi yoğun tapada boolean'ı bitirmiyordu. Kesilen parçadaki taban etiketli yüzler parçanın slotunu alır. Voxel veya SDF kesim yedeği yok.

**Bölge hazırlığı (her mod).** Adanın içinde kalan, adadan küçük boyanmamış alanlar (delikler) kesime katılır. 1 mm²'den küçük, köşeden bağlı kırıntı adalar atlanır.

**Duvar kontrolü (X6, önizlemede).** Her yuva (pim yuvası veya tapa yuvası) clearance + en az duvar kadar büyütülür, yuvanın yüzeye açılan ağzı kesim yüzeyinin `minWall + halkanın düzlemden sapması` altından kırpılır, kalan kısım yuvayı içeren katıdan çıkarılır. Artan hacim duvarın ince kaldığı yerdir; önizlemede kırmızı çizilir ve uyarı verilir.

**Kesim modu önerisi (X5, `suggestCutMode`).** En büyük adanın kesim halkası alanından eşdeğer yarıçap r, bölge + düz kapak hacminden ortalama çıkıntı yüksekliği h = hacim / kesit hesaplanır. r ≥ 4 mm ve h ≥ 0.8·r ise Keys (kulak, kol, kafa), değilse Socket (göz, kaş, burun). Boyama durulunca Worker'da hesaplanır, kesim panelinde "Uygula" ile seçilir.

**Çıkıntı önerisi (B9, `suggestFeatures`).** İçbükeylik haritasının en düşük (en tümsek) noktaları birbirinden en az 10 kenar uzak tohum seçilir; her tohumdan otomatik ölçekli Smart Fill (çukurda dur) + vadiye oturtma çalışır. Taşan, alanı toplamın %0.05–%15'i dışında kalan veya öncekilerle %30'dan fazla örtüşen sonuçlar elenir. Büyükten küçüğe yeni slotlara boyanır; iç içe olanlarda küçük olan üstte kalır.

## Smart Fill (`src/core/paint.ts`)

Tohum üçgenden BFS. Aday üçgenin normali, yolda `ölçek` mm geride kalan atasının normaliyle karşılaştırılır; komşu üçgen karşılaştırması yoğun mesh'te kıvrım birçok üçgene yayıldığı için eşiği hiç aşmıyor. Komşuyla karşılaştırma yine de yapılır, ama yalnız 70°'den keskin kıvrımda (X92, X93; voxel ile yeniden kurulmuş mesh'te komşular 20–60° basamak yapar): ölçekten küçük bir tümseğin (figür burnu) dibindeki keskin kıvrımda ata tümseğin önünde kalır ve normali dış yüzeyle aynı yöne bakar; yalnız ataya bakınca kıvrım görünmez, seçim bütün başa taşar. "Sadece çukur kenarda dur" modunda eşiği aşan kıvrım, yerel kenar içbükeyse durdurur; tümsek tepelerinden geçilir (göz, kaş, burun gibi çıkıntılar tek tıkla seçilir). Ölçek otomatikte tıklanan özelliğe göre seçilir (X14): ortalama kenarın 3, 4, 6, 8, 12, 16 katı sırayla denenir; modelin %40'ından azını kaplayan ve sonraki iki ölçekten biriyle ±%25 benzer alan veren ilk ölçek alınır (testa.stl: göz/kaş/burun 1.3 mm, kulak 3.4 mm). Sonuçtaki küçük, aynı etiketli delikler kapatılır.

**Vadiye oturtma.** Üçgen başına içbükeylik (köşe Laplace vektörünün normal bileşeni, ölçek kadar difüzyonla yumuşatılmış; pozitif = çukur) hesaplanır. Smart Fill sonucunun sınırından `2 × ölçek` içindeki üçgenler belirsiz sayılır; seçimin derini ve dışarının uzağı işaretleyicidir. İki havza içbükeylik değerine göre düşükten yükseğe taşar ve vadi çizgisinde (içbükeyliğin en yüksek olduğu yerde) buluşur. Sonra sadece tıklanan noktanın bağlı olduğu parça tutulur.

**Gap Fill (B5, `gapFill`).** Alanı eşikten küçük, aynı etiketli adalar en uzun ortak sınırını paylaştığı komşu etikete geçer.

**Çizgi aracı (X36, `src/core/lasso.ts`).** Yüzeye tıklanan noktalar arasında yüzeyde en kısa yol kurulur. Halka kapanınca içi aktif slota boyanır; sınır yumuşatılıp üçgenlerin içinden işlenir. Ayna açıksa karşı tarafta da aynı halka boyanır.

**Kesim kenarı (X53, `smoothCutEdge`).** Kesim, önizleme ve pim yerleşimi, "Kenarı düzelt" açıksa slot sınırını bu fonksiyonla üçgenlerin içinden geçirir. Yalnız taban slota taşar. Sonuç boyama kaydına yazılmaz; manifold önbelleği yumuşatılmış kopyaya ayrı anahtarla bağlanır.

**Sınırı yumuşat (B6, `src/core/smooth.ts`).** Bölgenin sınır halkaları çıkarılır ve yay uzunluğu boyunca Gauss çekirdeğiyle (σ = yarıçap) düzgün bir eğriye çevrilir. Eğrinin `1.5 × yarıçap` yakınındaki her üçgen, eğriye işaretli uzaklığına göre (halka yönünde bölge solda) içe ya da dışa atanır. Gauss eğriyi büzdüğü için sınır, bölge alanı eskisine eşit olacak kadar dışa kaydırılır (alan dengesi); bu yüzden tekrar basmak bölgeyi daraltmaz. Kırıntılar ve delikler temizlenir, ardından yeni sınır köşeleri yüzey üzerinde (teğet düzlemde) eğriye çekilir; üçgeni ters çeviren veya %30'un altına incelten hareket geri alınır. Mesh konumları değiştiği için parça yeni mesh ile değiştirilir.

**Sınırı üçgen içinden kesme (X30, `cutAlongCurves`).** "Üçgenleri böl" açıkken köşe çekme yerine yumuşatılmış eğriye işaretli uzaklık köşelerde hesaplanır (alan ağırlıklı köşe normali ile; bant dışındaki köşe çevresindeki etiket çoğunluğunun işaretini alır). Sıfır çizgisi bir köşeye kenarın %12'sinden yakın geçiyorsa köşeden geçirilir (ince şerit üçgen oluşmaz). İşaret değiştiren kenarlarda kesişim köşesi eklenir (kenar başına bir kez, komşu üçgenler paylaşır: mesh kapalı kalır), üçgen iki çokgene ayrılıp yelpazelenir, dörtgen kısa köşegenden bölünür. Yeni köşeler eski kenarların üstünde olduğundan şekil ve hacim değişmez. Alan dengesi bölünmüş mesh üzerinde iki adımda yeniden kurulur.

**Fırça izinde bölme ve fark kaydı (X34).** "Üçgenleri böl" açıkken yumuşatma darbesi bitince fırçanın alanı (sınıra işaretli uzaklık, 2G − G∘G) darbe izinin tamamı için bir kez daha hesaplanır ve `splitAlongField` ile sıfır çizgisi boyunca bölünür. İzin dışındaki köşeler + (içeride), − (dışarıda) ya da 0 (sınırda) alır; orada sıfır çizgisi mevcut sınırdan geçer, bölme olmaz. Bölme sonucu bir farktır (`SplitDiff`): eski köşe ve üçgen numaraları korunur, bölünen üçgenin ilk parçası yerinde kalır, diğerleri sona eklenir. Fark mesh nesnesine yerinde uygulanır (diziler değişir, nesne aynı kalır), bu yüzden eski boyama ve geometri kayıtları geçerli kalır. Geri alma kaydı yalnızca farkı tutar: her darbede tam kopya saklamak belleği doldurup modelin kaybolmasına yol açmıştı (X23). "Tüm sınırı yumuşat" da aynı kaydı kullanır.

**Bölmeden sonra yerinde güncelleme (X38).** Viewport'ta parçanın ana geometrisi bölme öncesi üçgen sayısıyla kalır: yerinde değişen üçgenler yazılır, sona eklenenler ana mesh'in çocuğu olan küçük bir yama mesh'te kurulur (seçimde yama üçgenine ofset eklenir). Ekleme %5'i aşarsa ya da üçgen sayısı düşerse baştan kurulur. Seçim ağacında sadece konumu değişen üçgenlerin kutusuna değen düğümler yeniden oturtulur. Komşuluk (`patchAdjacency`: değişen + eklenen + değişenlerin eski komşuları kendi aralarında eşlenir) ve yüz bilgileri de yerinde güncellenir. 1.9M üçgende darbe sonu ~2.9 s'den ~0.35 s'ye indi.

**Yumuşatma fırçası (`smoothBoundaryAt`).** Fırça altındaki köşelere sınıra işaretli uzaklık verilir (içeride +). Alan yerel komşuluk grafiğinde 2G − G∘G süzgeciyle yumuşatılır (G: σ = yarıçap/2 Gauss; bu süzgeç büyük ölçekli biçimi koruduğu için bölge büzülmez), fırça merkezinden kenara azalan ağırlıkla karıştırılır. Üçgenler yeni alanın işaretine göre etiketlenir; sınır köşeleri alanın eğimi boyunca sıfır noktasına kaydırılır. Darbe boyunca parçanın mesh'i yerinde değişir (kopya yok), viewport sadece değişen üçgenleri günceller; darbe sonunda değişen köşe ve üçgenlerin önceki/sonraki değerleri tek bir `geometry` geri alma kaydına yazılır. Tam kopya saklamak uzun oturumlarda belleği doldurup grafik bağlamını düşürüyordu (X23).

## Arayüz

- Viewport'un solunda araç çubuğu (Smart Fill F, Fırça B, Silgi E, Yumuşat S, Kova G, Pim P), üstünde seçili aracın ayar şeridi.
- Sayı alanları (`src/ui/fields.tsx`): etiketi sürükleyerek değiştirilir (Shift ince ayar), kutuya yazılabilir; geniş aralıklı değerler oransal (log) değişir.
- Kamera: sağ sürükle döndür, orta / Ctrl+sağ kaydır, tekerlek yakınlaştır, Alt+tekerlek fırça boyutu.

## Dışa aktarma (`src/io`)

- **3MF (Bambu/Orca)** (`bambu3mf.ts`): Bambu Studio'nun kendi proje yapısı (her parça `3D/Objects/object_N.model`, ana modelde bileşen), parça başına `extruder` numarası `Metadata/model_settings.config` içinde; aynı renk aynı numara. Parçalar tabanı z=0 olacak şekilde plakaya dizilir. Alt dosyalardaki nesne kimlikleri benzersiz olmalı (aynı olursa Bambu tüm parçaları tek mesh sanıyor). `project_settings.config` yazılmaz ve dosya Bambu projesi olarak etiketlenmez: eksik ön ayarlı Bambu projesi Bambu Studio'yu çökertiyor. Bambu Studio 2.8 komut satırıyla yüklenip yeniden dışa aktarılarak doğrulandı: adlar ve filament numaraları korunuyor.
- **3MF (genel)**, **STL (ZIP)**, parça başına STL.
- **Tolerans deneme parçası (X35, `src/core/coupon.ts`):** seçili boşluğun 0,1 mm altı, kendisi ve 0,1 mm üstü için plaka ve pimler. Keys'te seçili pim şekli, Socket'te 4 mm yarıçaplı silindir tapa.

## Onarım (`src/core/repair.ts`)

Köşe kaynaştırma → dejenere ve tekrarlı üçgen silme → yönelimi BFS ile eşitleme, bileşeni dışa baktırma → açık halkaları merkezden yelpazeyle kapama → manifold doğrulaması. Doğrulamadan geçmezse voxel yedek onarım (`src/core/voxelRepair.ts`) devreye girer. Bu yol yalnızca kapanmayan mesh içindir, kesimin yedeği değildir. Yüzey ızgaraya işlenir, kapama yarıçapı (1–16 voksel) iç hacim oluşana kadar büyütülerek delikler kapatılır, dışarı taşırılıp içerisi bulunur; yüzeye yakın noktalarda uzaklık ve işaret en yakın orijinal üçgenden (mevcut yüzey korunur), delik bölgesinde voksel alanından alınır. `levelSet` ile kapalı yüzey çıkarılır, voksel yarısı kadar sapmayla sadeleştirilir, etiketler en yakın eski üçgenden aktarılır. Bu da başarısız olursa parça `!` rozetiyle işaretlenir.

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

**Plaka yerleştirme (X46, `src/io/layout.ts`).** Bambu 3MF'te her parça Z etrafında XY izdüşümünün en küçük sınır dikdörtgenine döndürülür (dışbükey zarfın kenar yönleri denenir; %3'ten az kazançta döndürülmez, uzun kenar X boyunca). Parçalar Y boyuna göre büyükten küçüğe raflara dizilir, plakanın ortasına hizalanır. Dönüş ve öteleme 3MF `item` dönüşümüne yazılır; mesh verisi değişmez. Plakaya sığmazsa uyarı verilir. Bambu Studio komut satırıyla açılıp dönüşümlerin korunduğu doğrulandı.

