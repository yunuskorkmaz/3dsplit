# `/audit ux` — kod denetimi (a/b/c akışları)

Tarih: 2026-10-28 · Taban: `be25220` (main) · Boyut: `ux` (tek boyut, tek bağımsız inceleyici)

## Yöntem ve kapsam

- Kullanıcı `/audit ux` çalıştırdı. Argümanda yol yok ve varsayılan kapsam (main'e göre diff) boş, yalnız izlenmeyen dosyalar var. Bu yüzden kapsam ilk istekteki 3 görevin kod yolu alındı: `src/ui/`, `src/viewport/Viewport.ts`, `src/state/`, `src/io/`, ve kullanıcıya dönen kısımları için `src/core/cut*.ts`, `paint.ts`, `lasso.ts`, `coupon.ts`, `src/worker/geometry.worker.ts`.
- İnceleyici `docs/review/` dosyalarını okumadı. Tarayıcıda deneme yapmadı, `npm test` çalıştırmadı.
- Birleştirmede (bu belge) her bulgu kodla yeniden kontrol edildi. Son sütun, bulgunun tarayıcıyla yapılan review'da (`00-ozet.md`) karşılığını gösteriyor. Karşılığı olmayanlar bu denetimin yeni katkısı.
- Bu belge `02-ux-audit.md`'nin yerine geçmez. O dosya, skill çalıştırılamadığı için elle yapılmış tarayıcı denetimi.

## Bulgular (önem sırasıyla)

| # | Bulgu | Yer | Ölçüt (ux.md) | Kodla doğrulama | 00-ozet karşılığı |
|---|---|---|---|---|---|
| 1 | Seçilen tolerans kalıcı değil | `store.ts:255`, `actionsSession.ts:83-120` | Gezinme ayarı kaybettiriyor; yanıltıcı varsayılan | Doğrulandı | #8 |
| 2 | Deneme parçası okununca değeri seçmenin yolu yok | `actionsCut.ts:537-600`, `Panels.tsx:363-389` | Etiket gereken bilgiyi söylemiyor | Doğrulandı | #8 (kısmen); `clearance=0` ayrıntısı yeni |
| 3 | Deneme parçası model olmadan üretilemiyor | `Panels.tsx:185`, `Panel.tsx:25-27`, `StepBar.tsx:13-18` | Birincil görevin kontrolü erişilemez | Doğrulandı | #8 |
| 4 | Renk eşlemesi 8 s'de kayboluyor; dışa aktarılanlar söylenmiyor | `actionsFile.ts:196-233`, `bambu3mf.ts:15-19` | Kısmi sonuç gizleniyor | Doğrulandı | #6 |
| 5 | Boyalı 3MF açılınca etkin set kasıtlı seçilmiyor | `actionsFile.ts:180-194` | İlk kullanım durumu akışı bozuyor | Kısmen: aşağıdaki nota bakın | #3, #7 |
| 6 | Kesimi geri almak pimleri, yönü ve bölge derinliklerini geri getirmiyor | `actionsCut.ts:387-396`, `actionsHistory.ts:67-74` | Kurtarma, eylemin gerçek sonucuyla örtüşmüyor | Doğrulandı | **Yeni** |
| 7 | Pimler parçaya ya da sete bağlı değil, sonraki kesime taşınıyor | `actionsPins.ts`, `cutPins.ts:127-138` | Değişiklik yanlış öğeye uygulanıyor | Akış kodda izlendi, tarayıcıda denenmedi | **Yeni** |
| 8 | Proje açmak ve "Yok say" onaysız; kayıtlı oturum kalıcı siliniyor | `actionsFile.ts:157-176`, `actionsSession.ts:135-138`, `App.tsx:67` | Yıkıcı eylem, onayı veya kurtarması olmadan | Doğrulandı | #1 ile aynı aile (oturum kaybı); "Yok say" ve proje açma yeni |
| 9 | Kes'in etkisi etkin araca bağlı ve görünmüyor (Dikiş) | `actionsCut.ts:165-168, 329-334`, `Panels.tsx:59, 167-174` | Mod hatası | Doğrulandı | #9, #12 |
| 10 | İç jargon ve eski adlar; çıkış yolu söylemeyen hatalar | `actionsFile.ts:193`, `cutCap.ts:42,58`, `cutSocket.ts:72-98`, `HelpDialog.tsx:20-27` | İç jargon; kurtarma yok | Doğrulandı ("slotlara aktarıldı" vb.) | #11, #12, #20 |
| 11 | Bildirimler ve panel başlıkları klavyeyle kullanılamıyor; `aria-live` yok | `Panels.tsx:598-608`, `Panel.tsx:41` | Erişilemez kontrol, eksik semantik | Doğrulandı (`div onClick`, `h3 onClick`, `aria-live` yok) | #14'e ek; bu iki öğe yeni |

### Ayrıntılar

**1. Tolerans kalıcı değil.** `cut.clearance` başlangıçta sabit 0,2 (`store.ts:255`). Ayar yalnız IndexedDB oturum görüntüsünde tutuluyor ve yalnız "Devam et" ile geri geliyor. Kullanıcı deneme parçasını basıp (saatler sürer) yeni bir model açtığında, "Yok say" ya da doğrudan sürükleme sonrası değer 0,2'ye ve "Normal"e dönüyor. Yön: boşluğu (ve pim ayarlarını) oturumdan bağımsız kullanıcı tercihi olarak sakla.

**2. Değeri seçme yolu yok.** Çentik → değer eşlemesi yalnız 8 s'lik `notify('info')` ile gösteriliyor. Basılı plakada sayı yok, yalnız çentik var. Sıkı/Normal/Gevşek ancak taban 0,2 iken 1/2/3 çentiğe denk geliyor. `clearance=0` iken değerler tekilleştirilip iki delik çıkıyor (`actionsCut.ts:540-542`), ama mesaj hâlâ "1, 2, 3 çentik" diyor. Yön: eşlemeyi kalıcı göster; "bu deliği seç" türü doğrudan seçim.

**3. Model şartı.** Düğme yalnız kesim panelinde ve panel `disabled={!hasParts}` (`Panels.tsx:185`). Boş ekranda ve komut paletinde yok. Üretilen parçalar `badge:'new'` aldığı için adım çubuğu kesim yapılmadan "Aktar"ı işaretliyor.

**4. Renk eşlemesi.** Slicer'da gerekecek tek bilgi olan "Filament N: …" 8 s sonra siliniyor. `exportObjects` gizli gövdeleri sessizce atlıyor. Kesilmemiş boyalı setler, parça başına tek extruder yazıldığı için dosyaya girmiyor ve bu söylenmiyor.

**5. Etkin set. Çelişki var, kısmen doğrulandı.** `ensurePaintSlots` `activeSlot`'u değiştirmiyor (`actionsFile.ts:180-194`); etkin set varsayılan 1'de kalıyor. İnceleyici bundan "Kes devre dışı, ekran boyama istiyor" sonucunu çıkardı. Tarayıcı review'unda ise Bluey'de filament 1 boyalı olduğu için tersi görüldü: 179 bin üçgenlik set kesime hazır geliyor (00-ozet #3). Sonuç modelin hangi filamentlerin boyalı olduğuna bağlı. Ortak kök neden aynı: içe aktarmada etkin set bilinçli seçilmiyor. "Seçim N" / "Filament N" ad karışıklığı doğrulandı (00-ozet #7).

**6. Geri al pimleri getirmiyor.** `runCut` `pins: []`, `direction: null`, `islandDepths: {}` ve `ringProfile` sıfırlıyor (`actionsCut.ts:387-396`). `parts` türü geçmiş kaydı bunları içermiyor; geri alma yalnız `parts` ve `selectedPartId`'yi döndürüyor (`actionsHistory.ts:67-74`). (b) akışında elle pim yerleştirip kesen, sonra Ctrl+Z yapan kullanıcı gövdeyi geri alıyor ama pimleri kaybediyor. Socket'teki elle yön ve bölge derinlikleri de gidiyor. Kaybolan iş ölçülebilir: yerleştirilen her pim yeniden konmak zorunda.

**7. Pimler global.** Pim dizisi yalnız kesim, sadeleştirme, ölçek ve proje açmada temizleniyor; set veya gövde değişince kalıyor. Sol kola konan pimler, set değiştirilip sağ kol kesilirken `pinCenters` ile en yakın adaya eşlenip kapağa izdüşürülüyor. Panel yalnız "N pim elle yerleştirildi" diyor, hangi bölge için olduğunu söylemiyor. Tarayıcıda denenmedi.

**8. Onaysız yıkıcı eylemler.** `.3dsplit` açmak sahneyi değiştirip geri al/yinele yığınlarını boşaltıyor; onay yok ve 1,5 s sonra otomatik kayıt eski oturumu eziyor. "Kaldığın yer" kartı açıkken sürüklenen dosya kartı kaldırıyor ve kayıt üzerine yazılıyor. "Yok say" adının aksine kaydı kalıcı siliyor (`discardSession` → `clearSession`, `actionsSession.ts:135-138`).

**9. Dikiş mod hatası.** Dikiş seçiliyken Kes boyalı seçimi yok sayıyor, ama düğme boyalı seçim yüzünden etkin görünüyor (`!seamReady && !painted`). Panel başlığı "Yapıştır" diyor, şerit "Tapa"yı vurguluyor. Dikiş, seçim yapmadığı halde "Seç" grubunda Çizgi'nin yanında duruyor.

**10. Jargon.** X99'dan beri arayüz "seçim seti" diyor, ama mesajlarda "slot" geçiyor ("Taban slotu kesilemez", "slotlara aktarıldı"). Yardım "Smart Fill" ve "Keys modunda" diyor; arayüz adları "Akıllı seç" ve "Pimli kes". Kesim hataları "Sınır halkası kapak düzleminde çökük", "süpürme + prizma", "hacimsiz parça" gibi ifadeler kullanıyor ve ne yapılacağını (Kenarı düzelt, Yumuşat, Düzlemle kes) söylemiyor.

**11. Bildirim erişilebilirliği.** Mesajlar `div onClick` ile kapanıyor. Hata mesajları kendiliğinden kapanmadığı için klavyeyle kaldırılamıyor. Kapsayıcıda `aria-live`/`role="alert"` yok, yalnız meşgul kartında `role="status"` var. Panel başlıkları `h3 onClick` olduğu için katlanmış panel klavyeyle açılamıyor (WCAG 2.1.1, 4.1.2).

## Açık sorular (bulgu sayılmadı)

- Bambu boyalı 3MF'te boyasız yüzeyin Taban (gri) olması ux-plan X77'de bilinçli seçilmiş görünüyor; slicer'daki filament eşlemesine etkisi denenmedi.
- `cutModeManual` yalnız sahne boşken açılan modelde sıfırlanıyor (`actionsFile.ts:126`). Aynı oturumda (a)'dan (b)'ye geçince önerinin modu değiştirmemesi sorun mu, gözlem olmadan ayrılamıyor.
- İptalin kalıcı kırmızı "hata" olarak gösterilmesi (`actionsHooks.ts:49-51`).

## Sıcak noktalar ve sınırlar

- Git geçmişi (Ağustostan beri değişiklik sayısı): `actions.ts` 54, `Panels.tsx` 48, `store.ts` 47, `ViewportHost.tsx` 36, `Viewport.ts` 33. Bulgu 1–3, 6 ve 7 bu dosyalarda.
- Viewport.ts (1688 satır) yalnız tıklama ve mod kuralları açısından tarandı. Worker ve `cut*.ts` yalnız kullanıcıya dönen metin ve öneri açısından incelendi.
- Tarayıcı review'undaki kritik bulgu #1 (Cmd+Z dosya açmayı geri alıyor) ve #2 (bayat öneriyle yanlış mod) bu kod denetiminde ayrı bulgu olarak çıkmadı. Kod okuması zamanlamaya bağlı davranışları yakalamakta zayıf.
