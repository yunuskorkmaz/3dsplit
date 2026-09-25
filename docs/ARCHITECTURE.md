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
- Mesh'ler değiştirilemez kabul edilir; sadece `labels` boyamada yerinde değişir. Undo boyamada değişen üçgenlerin önceki/sonraki etiketini, kesimde parça listesinin önceki halini saklar.
- Etiketler boolean işlemlerden manifold `faceID` üzerinden geçer. Kesimle oluşan yeni yüzler geçici `CUT_FACE_ID` (0xfffe) alır, sonra parçanın slotuna veya tabana çevrilir. `0xffffffff` kullanılamaz: manifold onu "faceID yok" sayıyor.

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

## Smart Fill (`src/core/paint.ts`)

Tohum üçgenden BFS. Aday üçgenin normali, yolda `ölçek` mm geride kalan atasının normaliyle karşılaştırılır; komşu üçgen karşılaştırması yoğun mesh'te kıvrım birçok üçgene yayıldığı için eşiği hiç aşmıyor. "Sadece çukur kenarda dur" modunda eşiği aşan kıvrım, yerel kenar içbükeyse durdurur; tümsek tepelerinden geçilir (göz, kaş, burun gibi çıkıntılar tek tıkla seçilir). Ölçek varsayılanı ortalama kenar × 3. Sonuçtaki küçük, aynı etiketli delikler kapatılır.

**Vadiye oturtma.** Üçgen başına içbükeylik (köşe Laplace vektörünün normal bileşeni, ölçek kadar difüzyonla yumuşatılmış; pozitif = çukur) hesaplanır. Smart Fill sonucunun sınırından `2 × ölçek` içindeki üçgenler belirsiz sayılır; seçimin derini ve dışarının uzağı işaretleyicidir. İki havza içbükeylik değerine göre düşükten yükseğe taşar ve vadi çizgisinde (içbükeyliğin en yüksek olduğu yerde) buluşur. Sonra sadece tıklanan noktanın bağlı olduğu parça tutulur.

**Sınırı yumuşat (B6).** Önce küçük yarıçaplı (ortalama kenar × 1.5) alan oylaması tek üçgenlik diken/çentikleri alır, kırıntılar ve delikler temizlenir. Sonra bölge sınırındaki köşeler, sınırdaki iki komşusunun ortasına doğru teğet düzlemde kaydırılır (6 adım; üçgeni ters çeviren hareket geri alınır, üç bölgenin buluştuğu köşeler sabit). Mesh konumları değiştiği için parça yeni mesh ile değiştirilir.

## Onarım (`src/core/repair.ts`)

Köşe kaynaştırma → dejenere ve tekrarlı üçgen silme → yönelimi BFS ile eşitleme, bileşeni dışa baktırma → açık halkaları merkezden yelpazeyle kapama → manifold doğrulaması. Doğrulamadan geçmeyen parça `!` rozetiyle işaretlenir; boyanabilir ama kesim başarısız olabilir.

## Test

- `npm test`: `test/` altında Vitest, çekirdek fonksiyonlar Node'da manifold-3d ile.
- Görsel kontrol elle: `node samples/make-figure.mjs` ile test figürü üretilir.
