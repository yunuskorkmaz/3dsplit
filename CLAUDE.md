# 3dsplit — çalışma kuralları

Boyanmış bölgeyi (göz, kaş, kol…) modelden Socket veya Keys bağlantısıyla ayıran tarayıcı aracı. Ayrıntı: `docs/project-brief.md`, mimari: `docs/ARCHITECTURE.md`.

## İş takibi

- Yapılacak işler ve durumları `docs/ROADMAP.md` içinde. Bir işe başlamadan önce oradan seç; bitirince durumunu `[x]` yap ve "Tamamlananlar günlüğü"ne tarih + commit ekle.
- Yeni fark edilen iş roadmap'e `X<n>` numarasıyla eklenir; kafadan iş yapılmaz.
- Her iş ayrı commit. Commit mesajı Türkçe, iş numarasıyla başlar (ör. `C5: Socket squeeze`).

## Kod

- Tanımlayıcılar İngilizce, yorumlar ve arayüz metinleri Türkçe.
- `src/core` saf kalır: DOM, React, Three.js import edilmez. Yeni geometri fonksiyonu için `test/` altında test yazılır.
- Ağır işler Worker'da (`src/worker/geometry.worker.ts`), boyama ana thread'de.

## Kontroller

```sh
npm test            # çekirdek (Vitest)
npm run e2e         # arayüz smoke testi (Playwright): yükle → Smart Fill → Socket → 3MF
npx tsc --noEmit -p .
npx vite build
```

Arayüz değişikliği tarayıcıda denenir: `npm run dev`, test modeli `node samples/make-figure.mjs`.
