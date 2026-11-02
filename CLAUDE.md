# 3dsplit — agent talimatı

Bu dosya `AGENTS.md` ile aynı içeriği taşır. Birini değiştirince diğerini de değiştir.

## Amaç

Boyanmış bir bölgeyi (göz, kaş, kol…) modelden ayırıp Socket (tapa + yuva) veya Keys (pim + yuva) ile geri birleşebilir, ayrı basılabilir parça yapmak. Böylece AMS olmadan çok renkli baskı olur. Tarayıcıda çalışır; dosya sunucuya gitmez.

Ana akış: yükle ve onar → Smart Fill / fırça / çizgi / kova ile seç → sınırı yumuşat → Space ile önizle → Socket, Keys veya Fast ile kes → 3MF veya STL dışa aktar. Kesilen eski parça sarı "kaynak" rozetiyle gizlenir.

## Ne bitti

A1–E2 (`docs/project-brief.md`) ve X1–X127 (`docs/ROADMAP.md`) uygulandı. Arayüz kararları `docs/ux-plan.md`'de. Yeni iş **X128**; davranış onaylanmadan arayüz kodlanmaz. Kullanıcı istemeden özellik ekleme. Yeni işe başlamadan önce roadmap'e yaz; bitince `[x]` yap ve "Tamamlananlar günlüğü"ne tarih + commit ekle.

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

## İş takibi: GitHub Project panosu

Bu reponun işleri tek panoda tutulur: https://github.com/users/yunuskorkmaz/projects/5
Yapılacak işin kaynağı panodur; doküman ve plan dosyalarındaki checkbox'lar değil.
Gereken: `gh` girişi ve `project` yetkisi (`gh auth refresh -s project`).

Sabitler (değişmez):
- Project: `5`, owner `yunuskorkmaz`, project ID `PVT_kwHOAE0cAs4Bp0x8`
- Status alanı `PVTSSF_lAHOAE0cAs4Bp0x8zhoOlh8`: Backlog `56177274`, Planlandı `87026363`,
  Yapılıyor `2c324072`, Review `a80ffcc5`, Bitti `1af6467d`
- Öncelik alanı `PVTSSF_lAHOAE0cAs4Bp0x8zhoOlpE`: Yüksek `39db99ea`, Orta `ad7122a3`, Düşük `131a13ad`

Komutlar:
```sh
# Bu reponun panodaki işleri
gh project item-list 5 --owner yunuskorkmaz --format json -L 500 \
  --jq ".items[] | select(.repository | endswith(\"/$(gh repo view --json name -q .name)\")) | \"\(.status)\t#\(.content.number)\t\(.title)\""

# Durum değiştir (item-add, kart zaten varsa mevcut item ID'sini döndürür)
ITEM=$(gh project item-add 5 --owner yunuskorkmaz --url <issue-url> --format json --jq .id)
gh project item-edit --id "$ITEM" --project-id PVT_kwHOAE0cAs4Bp0x8 \
  --field-id PVTSSF_lAHOAE0cAs4Bp0x8zhoOlh8 --single-select-option-id <durum-id>

# Yeni iş: issue aç, sonra yukarıdaki iki komutla panoya ekleyip durumunu ver
gh issue create -t "<başlık>" -b "<gövde>"
```

Akış:
- **İş verildiğinde:** bu reponun işlerine bak. İş bir issue'ya karşılık geliyorsa onu
  kullan. Karşılığı yoksa ve iş tek adımlık değilse issue aç, panoya ekle.
- **Başlarken:** durum `Yapılıyor`. Branch adında issue numarası olsun (`feat/12-short-name`).
- **Yalnız plan yazıldıysa:** durum `Planlandı`, planın yolunu issue'ya yorum olarak yaz.
- **Önemli adımda ve oturum sonunda:** `gh issue comment <no> -b "..."` ile kısa not:
  ne yapıldı, ne kaldı, engel var mı.
- **PR açınca:** gövdeye `Closes #<no>` yaz, durum `Review`. İş bittiğinde `Bitti`.
- **Fark edilen ama istenmeyen işler:** kendiliğinden yapma ve issue açma;
  kullanıcıya listele, isterse `Backlog` olarak ekle.
