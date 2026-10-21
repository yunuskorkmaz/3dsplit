# 3dsplit — agent talimatı

Bu dosya `AGENTS.md` ile aynı içeriği taşır. Birini değiştirince diğerini de değiştir.

## Amaç

Boyanmış bir bölgeyi (göz, kaş, kol…) modelden ayırıp Socket (tapa + yuva) veya Keys (pim + yuva) ile geri birleşebilir, ayrı basılabilir parça yapmak. Böylece AMS olmadan çok renkli baskı olur. Tarayıcıda çalışır; dosya sunucuya gitmez.

Ana akış: yükle ve onar → Smart Fill / fırça / çizgi / kova ile seç → sınırı yumuşat → Space ile önizle → Socket, Keys veya Fast ile kes → 3MF veya STL dışa aktar. Kesilen eski parça sarı "kaynak" rozetiyle gizlenir.

## Ne bitti

A1–E2 (`docs/project-brief.md`) ve X1–X92 (`docs/ROADMAP.md`) uygulandı. Arayüz kararları `docs/ux-plan.md`'de. Yeni iş **X93**; davranış onaylanmadan arayüz kodlanmaz. Kullanıcı istemeden özellik ekleme. Yeni işe başlamadan önce roadmap'e yaz; bitince `[x]` yap ve "Tamamlananlar günlüğü"ne tarih + commit ekle.

Çelişirse şu sıra geçerlidir:

1. Kod (`src/core`)
2. `docs/ARCHITECTURE.md` — kesim ve boyama yolu
3. `docs/ROADMAP.md` — iş durumu
4. `docs/project-brief.md` — amaç ve özellik kimlikleri

## Kesim ve boyama yolu

- **Fast ve Keys ayrımı** (`capSplit`): sınır halkası düzleme izdüşürülüp kapatılır. Parça = ada + kapak, gövde = geri kalan + ters kapak. "Düzlemle kes" açıkken veya kapak üretilemezse Newell düzlemi kullanılır.
- **Keys pimi:** kapak normalinde, kapak yüzeyi üzerinde. Pim bir tarafa eklenir, tolerans kadar büyütülmüş delik karşı taraftan çıkar. Varsayılan: pim kesilen parçada (`pinOnPart`).
- **Socket:** düz yamada süpürme, çıkıntıda kapak prizması, oyukta yedek prizma. Yuva, hacmin tolerans kadar büyütülmüş halidir. Squeeze, 8 yönlü kesit ve ayak payı bu hacmin üzerindedir. Voxel yalnızca onarımdadır.
- **Boyama:** etiket dizisi, ana thread. Smart Fill ölçekli açı, çukurda durma ve vadiye oturtma kullanır. Çizgi aracı yüzeyde en kısa yoldur (`lasso.ts`). Yumuşatma Gauss ve alan dengesidir; "Üçgenleri böl" açıkken sıfır çizgisi üçgenlerin içinden geçer.

Ayrıntı `docs/ARCHITECTURE.md`. Varsayılan sayılar `src/state/store.ts` başlangıcındadır (tolerans 0,2 mm, derinlik 3 mm).

## Dosyalar

| Yer | İş |
| --- | --- |
| `src/core/cut.ts` | Fast, Socket, Keys, mod önerisi |
| `src/core/paint.ts` | Smart Fill, Gap Fill, çıkıntı önerisi |
| `src/core/smooth.ts` | Sınır yumuşatma, üçgen bölme |
| `src/core/lasso.ts` | Çizgi aracı |
| `src/core/repair.ts`, `voxelRepair.ts` | Onarım |
| `src/core/coupon.ts` | Tolerans deneme parçası |
| `src/worker/geometry.worker.ts` | Ağır işler |
| `src/state/` | Store, actions, undo |
| `src/viewport/Viewport.ts` | Çizim ve seçim |
| `src/ui/` | Paneller |
| `src/io/` | STL, OBJ, 3MF, `.3dsplit`, plaka |

## Geliştirme döngüsü

Özellik yazarken `.cursor/skills/gelistirme/SKILL.md`: tek roadmap maddesi, geometride önce test, arayüzde Google Chrome, commit yalnızca istenince.

## Kod

- Tanımlayıcılar İngilizce, yorumlar ve arayüz metinleri Türkçe.
- `src/core` saf kalır: DOM, React, Three.js import edilmez. Yeni geometri fonksiyonu için `test/` altında test yazılır.
- Ağır işler Worker'da, boyama ana thread'de.
- Her iş ayrı commit. Mesaj Türkçe, iş numarasıyla başlar (ör. `C5: Socket squeeze`).

## Kontroller

```sh
npm test            # çekirdek (Vitest)
npm run e2e         # arayüz (Playwright): yükle → Smart Fill → Socket → 3MF; çizgi, deneme parçası, ayrık görünüm
npx tsc --noEmit -p .
npx vite build
```

Arayüz değişikliği tarayıcıda denenir: `npm run dev`, test modeli `node samples/make-figure.mjs`.
