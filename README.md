# 3dsplit

Boyanmış bölgeleri ayrı basılabilir parçalara bölen tarayıcı aracı (Audja Color Painter + Separate by Color benzeri). Her şey tarayıcıda çalışır; dosya sunucuya gitmez.

Canlı: [yunuskorkmaz.github.io/3dsplit](https://yunuskorkmaz.github.io/3dsplit/)

## Çalıştırma

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # geometri çekirdeği testleri
npm run e2e        # tarayıcıda uçtan uca smoke testi (Playwright)
npm run build
node samples/make-figure.mjs   # samples/figure.stl test modeli
```

## Kullanım

1. STL / OBJ / 3MF (boyalı Bambu/Orca 3MF dahil) dosyasını sürükle-bırak veya üst çubukta **Aç**. Yüklemede otomatik onarım; kapanmazsa voxel onarım.
2. Slot seç (0–9). **Çıkıntıları öner** göz, burun, kaş, kulak gibi bölgeleri kendisi bulup boyar.
3. Araç çubuğu (sol): **Smart Fill** F (tıkla, ölçek otomatik), **Fırça** B, **Silgi** E, **Yumuşat** S (sınırın üstünde gezdir; "Üçgenleri böl" açıkken kenar üçgenlerin içinden geçer), **Kova** G, **Çizgi** L (yüzeye noktalar tıklayıp kapalı halka çiz), **Pim** P. Ayna ve araç ayarları üstteki şeritte. Sayı alanlarında etiketi sürükle.
4. Kesim paneli: **Socket** (tapa + yuva: derinlik, ayak payı, kesit şekli, squeeze, yön), **Keys** (pim: otomatik boyut, uç pahı, pim başına boyut/eksen, snap pim), **Fast**; Keys/Fast için **Düzlemle kes**. Panel bölgeye göre mod önerir.
5. **Tolerans**: parça ile yuva arasındaki boşluk (Sıkı 0.1 / Normal 0.2 / Gevşek 0.3 mm), Keys'te ayrıca boy boşluğu. **Deneme parçası üret** seçili ayarla üç farklı boşlukta küçük bir test plakası ve pimler ekler.
6. **Space** önizleme (ince duvar kırmızı), **Kes**. Eski parça sarı "kaynak" rozetiyle gizlenir, yeni parçalar mavi.
7. Parçalar: göz simgesi gizle/göster, Alt+tık ya da ◎ yalnız o parça, **Tümünü göster**; üst çubukta **Ayrık** (X) parçaları birbirinden uzaklaştırır.
8. **Dışa aktar**: 3MF (Bambu/Orca için renk başına filament, plakaya dizili), 3MF (genel), STL (ZIP); **Kaydet** (`.3dsplit`).

Kısayollar, fare hareketleri ve iş akışı: **?** tuşu veya sağ üstte **Yardım** (kısayollar oradan değiştirilir).

## Dokümanlar

- [docs/ROADMAP.md](docs/ROADMAP.md): iş listesi, durumlar, şimdiki sprint
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): katmanlar, veri modeli, kesim algoritmaları
- [docs/project-brief.md](docs/project-brief.md): proje dokümanı (özellik listesi, fazlar)
