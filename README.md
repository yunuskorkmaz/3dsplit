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

## Yapı

| Dizin | İçerik |
| --- | --- |
| `src/core` | Saf TypeScript geometri çekirdeği: onarım, komşuluk, boyama algoritmaları, kesim (manifold-3d). DOM/Three.js bağımlılığı yok, Node'da test edilir. |
| `src/worker` | Ağır işler (onarım, boolean, kesim) için Web Worker (Comlink). |
| `src/viewport` | Three.js sahnesi, BVH ile seçim. React'ten bağımsız. |
| `src/state` | Zustand store, aksiyonlar, undo/redo. |
| `src/io` | STL/OBJ/3MF içe aktarma, STL/3MF/ZIP dışa aktarma. |
| `src/ui` | React paneller. |
| `test` | Vitest testleri. |

## Kesim algoritmaları

- **Fast / Keys:** bölge sınır halkaları kendi düzlemlerine izdüşürülüp üçgenlenir, parça ve gövde bu kapakla kapatılır (boolean yok). Keys'te pim `parça ∪ pim`, yuva `gövde − büyütülmüş(pim)`.
- **Socket:** bölge yüzeyi seçilen yön boyunca `+eps`'ten `−derinlik`'e süpürülerek hacim `V` üretilir. `tapa = model ∩ V`, `gövde = model − büyüt(V, clearance)`. Bölge bu yönde yükseklik alanı değilse üçgen başına prizma birleşimine düşer (yavaş).
- Etiketler manifold `faceID` üzerinden kesim sonrasına taşınır; sonraki kesimler yeni parçalar üzerinde yapılabilir.

## Bilinen eksikler (MVP)

- Pim için gizmo (S/E/R) yok; boyut kaydırıcılarla, konum tıklamayla.
- Socket yönü otomatik (bölge normallerinin ortalaması); gizmo ile ayar yok.
- Boyalı 3MF'in renkleri içe alınmıyor; Bambu/Orca filament ataması 3MF'e yazılmıyor.
- Smooth sınır, proje kaydetme, mirror/x-ray boyama yok.
