# 3dsplit

Boyanmış bölgeleri ayrı basılabilir parçalara bölen tarayıcı aracı (Audja Color Painter + Separate by Color benzeri). Her şey yerelde çalışır; dosya sunucuya gitmez.

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

1. STL / OBJ / 3MF (boyalı Bambu/Orca 3MF dahil) dosyasını sürükle-bırak veya **İçe aktar**. Yüklemede otomatik onarım; kapanmazsa voxel onarım.
2. Slot seç (0–9). **Çıkıntıları öner** göz, burun, kaş, kulak gibi bölgeleri kendisi bulup boyar.
3. Araç çubuğu (sol): **Smart Fill** F (tıkla, ölçek otomatik), **Fırça** B, **Silgi** E, **Yumuşat** S (sınırın üstünde gezdir), **Kova** G, **Pim** P. Ayna, X-ray ve araç ayarları üstteki şeritte. Sayı alanlarında etiketi sürükle.
4. Kesim paneli: **Socket** (tapa + yuva: derinlik, ayak payı, kesit şekli, squeeze, yön), **Keys** (pim; pim başına boyut/eksen, snap pim), **Fast**; Keys/Fast için **Düzlemle kes**. Panel bölgeye göre mod önerir.
5. **Space** önizleme (ince duvar kırmızı), **Kes**. Eski parça sarı "kaynak" rozetiyle gizlenir, yeni parçalar mavi.
6. **3MF** (Bambu/Orca için renk başına filament, plakaya dizili), **3MF (genel)**, **STL (ZIP)**; **Projeyi kaydet** (`.3dsplit`).

Kamera: sağ sürükle döndür, orta / Ctrl+sağ kaydır, tekerlek yakınlaştır, Alt+tekerlek fırça boyu, **Home** / boşluğa çift tık görünümü sığdır (Blender düzeni ve ters yakınlaştırma sol panelde). Ctrl/Cmd+Z geri al. Kısayollar sol panelden değiştirilebilir.

## Dokümanlar

- [docs/ROADMAP.md](docs/ROADMAP.md): iş listesi, durumlar, şimdiki sprint
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): katmanlar, veri modeli, kesim algoritmaları
- [docs/project-brief.md](docs/project-brief.md): proje dokümanı (özellik listesi, fazlar)
