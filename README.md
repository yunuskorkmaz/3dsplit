# 3dsplit

Boyanmış bölgeleri ayrı basılabilir parçalara bölen tarayıcı aracı (Audja Color Painter + Separate by Color benzeri). Her şey yerelde çalışır; dosya sunucuya gitmez.

## Çalıştırma

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # geometri çekirdeği testleri
npm run build
node samples/make-figure.mjs   # samples/figure.stl test modeli
```

## Kullanım

1. STL / OBJ / 3MF dosyasını sürükle-bırak veya **İçe aktar**. Yüklemede otomatik onarım yapılır.
2. Slot seç (1–9), bölgeyi boya: **Smart Fill** (F), **Fırça** (B), **Kova** (G). Shift: sil. Shift+sağ sürükle: Smart Fill eşiği. Gap Fill küçük boşlukları kapatır.
3. Kesim modu: **Fast** (düz kapak), **Socket** (tapa + yuva, derinlik ve clearance), **Keys** (düz kesim + pim; "Pim yerleştir" ile bölgeye tıklanarak konur).
4. **Space** önizleme, **Kes**. Eski parça sarı "kaynak" rozetiyle gizlenir, yeni parçalar mavi.
5. **Split** kopuk parçaları ayırır. **3MF** veya **STL (ZIP)** ile dışa aktar.

Kamera: boşlukta sol sürükle / Alt+sol döndür, sağ tık kaydır, tekerlek yakınlaştır. Ctrl/Cmd+Z geri al.

## Dokümanlar

- [docs/ROADMAP.md](docs/ROADMAP.md): iş listesi, durumlar, şimdiki sprint
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): katmanlar, veri modeli, kesim algoritmaları
- [docs/project-brief.md](docs/project-brief.md): proje dokümanı (özellik listesi, fazlar)
