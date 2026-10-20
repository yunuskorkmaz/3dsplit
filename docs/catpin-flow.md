# CatPin benzeri akış: boyayarak seç, pin hemen gelsin

20 Ekim 2026. Bu dosya bir sonraki geliştirme turunun girdisidir: hedef akış, at modelinde bulunan hatalar ve X71–X76 işleri. Madde durumları `docs/ROADMAP.md`'de tutulur.

## Neden 3dsplit

Aynı işi iki araçta denedik: at modelinde başı seçip pinli ayrı parça yapmak. Model `~/Downloads/_75_caballo_key-fins.stl` (73 862 üçgen).

| | Blender eklentisi (catpin-rea/BaskıKes) | 3dsplit (X70, 760dd4c) |
| --- | --- | --- |
| Seçim | Sculpt moduna geçip Face Set fırçasıyla elle boyama. Üç darbe dört ayrı bölge oldu | Akıllı seç ile başa tek tık. Baş tamamen boyandı |
| Kesim | Başı ayırmadı; tepeden küçük bir parça kopardı | Baş ayrı parça oldu, gövdede yuvası kaldı. Yaklaşık 0,9 s |
| Pin | Pin görmek için taslak moduna geçmek gerekiyor | Önizlemede pinler gerçek boyutta görünüyor, "Elle yerleştir" ile taşınıyor |

Kullanıcının kararı: Blender eklentisi bırakıldı, CatPin'den istenenler 3dsplit'e eklenecek. Kullanıcının istediği, CatPin'de beğendiği şey: **bölgeyi boyayarak seçmek, sonra pinin kendiliğinden gelmesi.**

## Hedef akış

Her adım ekranda tek bir şey ister. Bugünkü araçlar korunur; değişen, adımlar arasındaki kendiliğindenlik.

1. **Aç.** Model yüklenince en uzun kenar milimetre olarak parça satırında yazar. 250 mm üstü ya da 8 mm altıysa sarı uyarı ve "Baskı boyu" alanı (varsayılan 100 mm) ile tek tıkla ölçekleme (X71). Pin ve tolerans milimetre olduğu için bu adım pinin anlamlı olmasının ön koşuludur.
2. **Seç.** Akıllı seç ile tıkla; eksik yeri fırçayla tamamla. Değişen bir şey yok.
3. **Mod kendiliğinden doğru.** Kafa, kol, bacak gibi kalın bölgede öneri "Pimli kes" olur ve boya bitince mod kendiliğinden ona geçer. Göz, kaş gibi sığ bölgede Tapa kalır. Kullanıcı modu elle değiştirirse bir daha üzerine yazılmaz (X72).
4. **Pinler hemen gelir.** Pimli kes'te boya değişince önizleme kendiliğinden (gecikmeli, iptal edilebilir) çalışır. Space'e basmak gerekmez. Kesim yüzü yarı saydam görünür, pinler bu yüzün içinde ve kenardan uzakta durur (X73, X74). Pine tıklayıp sürüklemek onu kesit yüzünde taşır; boş kesite tıklamak pin ekler; Delete siler. Bugünkü "Elle yerleştir" bu davranışın varsayılanı olur.
5. **Kes.** Tek parça + gövde çıkar. Boyanın içine düşen başka kabuklardan (kayış, göz) kırıntı parça çıkmaz; ya ana parçaya katılır ya da hiç kesilmez (X75).
6. **Aralıklı ve dışa aktar.** Değişen bir şey yok.

CatPin'in taslak listesi (kesimleri biriktirip sonra üretmek) bu turda yok; `docs/HEDEF.md`'deki "sonraya bırakılanlar" kararı geçerli.

## At modelinde bulunan hatalar

> Sonradan (X73): at başı gövdeden ayrı bir kabuk; boyanın tek kesim yüzü kulak diplerindeki ~4 mm'lik halkalar ve oraya pin sığmıyor. Bu yüzden at e2e'si kaldırıldı, kanıt `e2e/keys-flow.spec.ts` (testa kulağı, Yoda başı).

Tekrarlama: `HORSE_STL=$HOME/Downloads/_75_caballo_key-fins.stl npx playwright test e2e/horse-keys.spec.ts`. Test bugün bilerek başarısız olur; X72–X75 bitince geçmelidir. Ekran görüntüleri `test-results/horse-keys-*.png`.

Adımlar: modeli aç, `1`, `F`, başın ortasına tıkla (kanvasın %62,9 / %71,6 noktası), Pimli kes, Önizleme, Kes.

1. **Öneri baş için Tapa diyor.** Mesaj: "Tapa — yüzeysel bölge (kesit ~4 mm, yükseklik ~123.6 mm)". `suggestCutMode` (`src/core/cutRun.ts:429`) kesit alanını bütün sınır halkalarının `loopPlane` alanlarının toplamından alıyor. Başta dış halka eğri ve bölgenin içinde 5 boyanmamış delik var; alan küçük çıkıyor (yarıçap ~2 mm), `capRadius >= 4` şartı düşüyor. Yükseklik 123,6 mm ise bu alana bölünmüş hacim. Kalınlık ölçüsü bölge hacmi ile en büyük dış halkanın alanından gelmeli; delik halkaları alandan çıkarılmalı. `caballo.3mf`'de de aynı: "kesit ~7 mm, yükseklik ~0.5 mm".
2. **Pinler kesitin dışına taşıyor.** Kes sonrası: "Pim 1 … %90 içeride", "Pim 2 … %70", "Pim 3 … %57", "Pim 4 … %24". Önizlemede de "Pim 1 çevresinde duvar 0.8 mm'den ince" uyarısı var. `checkPinContainment` (`src/core/cutPins.ts:318`) sorunu buluyor ama yalnız uyarıyor; pin yeri düzeltilmiyor. `caballo.3mf`'de 18'den fazla pin ve yarısı dışarıda.
3. **Pinler küçük adalara gidiyor.** Boyalı bölge kafanın yanında kayış gibi ayrı kabukların parçalarını da içeriyor. `autoPinPoints` (`src/core/cutPins.ts:158`) her adaya pin koyuyor; 1 344 ve 866 üçgenlik kırıntılar da pin alıyor.
4. **Kırıntı parçalar.** Sonuç 4 yeni parça: baş (17 604 üçgen), gövde ve iki kırıntı ("horse Renk 1 2" 1 344, "horse Renk 1 3" 866 üçgen). Tapa modunda da boyun çevresinde kırmızı kırıntılar kalıyor.
5. **Pin görmek için Önizleme gerekiyor.** Boya bittiğinde Pimli kes'te hiçbir şey görünmüyor; kullanıcı pinin geleceğini bilmiyor. CatPin'de pin kesimle birlikte görünür.
6. **Model ölçüsü görünmüyor, ölçeklenemiyor.** At STL'i ham birimde ~34 mm geliyor. Ölçü hiçbir yerde yazmıyor, değiştirmenin yolu yok.

## Blender denemesinden taşınacak çözümler

`/Users/yunuskorkmaz/Projects/catpin-rea/baskikes/geom.py` içinde test edilmiş, burada TypeScript'e çevrilecek fikirler (kod kopyalanmaz, algoritma alınır):

- **Pini içeri çekme** (`_settle`, `_inside`, `_wall_needed`): kesit sınır noktalarından KD ağacı (burada `spatial.ts`) kurulur. Aday pin merkezinin çevresinde 19×19 ızgara taranır. Her aday için iki şey ölçülür: içeride mi (en yakın yüz normali, iç içe kabukta ışın sayımı) ve sınıra uzaklığı. Gereken uzaklık: pin yarıçapı + tolerans + 0,8 mm. Bu uzaklığı sağlayan, hedefe en yakın aday seçilir; hiçbiri sağlamıyorsa pin konmaz ve "kesit pin için çok ince" denir. Blender'da pinli kesimin hacim farkı +79 mm³'ten (pin dışarı taşıyordu) −9 mm³'e (yalnız tolerans boşluğu) indi.
- **Küçük adaya pin yok** (`placements_from_points`): kesit adasının uzun ekseni gereken uzaklığın 2 katından kısaysa ada pin almaz. Pin alabilen her ada en az bir pin alır (iki bacak = iki pin); fazla pin sayısı en uzun adalardan başlayarak dağıtılır.
- **İç içe kabuk ve kırıntı** (`_group_nested`, `_drop_debris`): kutusunun %60'ı daha büyük bir parçanın kutusunda kalan ada o parçaya katılır (göz, iç kabuk). 0,5 mm³ altı parça atılır. Hem çıkan parçaya hem gövdeye düşen aynı kabuğun (yüz sayısı aynı, hacim farkı %1'den az) gövdedeki kopyası silinir.
- **Kesit noktası seyreltme**: kümeleme ve pin yeri için kesit noktası 4 000 ile sınırlı; yoğun modelde O(n²) kümeleme Blender'da 647 bin üçgende 14,5 s sürüyordu.

## İşler

| # | İş | Bitti sayılması |
| --- | --- | --- |
| X71 | Model ölçüsü ve baskı boyu | Parça satırında en uzun kenar mm. 250 üstü / 8 altı uyarı. "Baskı boyu" ile ölçekleme geri alınabilir. Test: `test/` |
| X72 | Doğru mod önerisi ve kendiliğinden geçiş | Atın başı ve kol/bacak "Pimli kes", göz/kaş "Tapa" önerir. Boya bitince mod öneriye geçer; kullanıcı elle seçtiyse geçmez. Test: `suggestCutMode` için baş, kol, göz örnekleri |
| X73 | Pin kesitin içinde | Hiçbir otomatik pin `checkPinContainment` uyarısı vermez; sığmıyorsa pin konmaz ve neden yazılır. Küçük adalar pin almaz. Test: U biçimli kesit, iki bacak, ince kayış |
| X74 | Canlı pin önizlemesi | Pimli kes'te boya değişince önizleme 300 ms sonra kendiliğinden çalışır, yeni boya gelince eskisi iptal edilir. Pin sürükle/ekle/sil önizlemede varsayılan. e2e: boya → pin görünür, Space'e basmadan |
| X75 | Kırıntısız kesim | At başı kesimi tam 2 parça verir (baş + gövde). Boyanın içindeki ayrı kabuklar ana parçaya katılır; 0,5 mm³ altı parça çıkmaz. Test: iç içe kabuklu örnek |
| X76 | At e2e'si | `e2e/horse-keys.spec.ts` geçer: öneri Pimli kes, pin uyarısı yok, 2 parça |

Sıra: X71 ve X72 bağımsız. X73 ile X75 aynı yeri (kesit adaları) değiştirir; önce X75, sonra X73. X74 X73'ten sonra, çünkü pinler içeride değilken canlı önizleme yanlış pinleri hemen gösterir. X76 en son.
