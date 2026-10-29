/** X111: yeni seçim setinin rengi; modeldeki renklerden ayırt edilsin. */

/** Bu uzaklığın altındaki iki renk ekranda karışır ("redmean" ölçeği, 0–765). */
export const MIN_COLOR_DISTANCE = 90;

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Algıya yakın RGB uzaklığı (redmean). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const r = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Paletten, kullanılan renklerin hepsine en uzak rengi seçer. Paletin hiçbiri
 * yeterince uzak değilse 24 tonluk çemberden en uzağı üretilir.
 */
export function pickSlotColor(palette: string[], used: string[]): string {
  const score = (c: string) => Math.min(...used.map((u) => colorDistance(c, u)), Infinity);
  const best = (cands: string[]) => cands.reduce((a, b) => (score(b) > score(a) ? b : a), cands[0]);
  const fromPalette = best(palette);
  if (!used.length || score(fromPalette) >= MIN_COLOR_DISTANCE) return fromPalette;
  const wheel = Array.from({ length: 24 }, (_, i) => hsl(i * 15, 0.7, 0.55));
  const fromWheel = best(wheel);
  return score(fromWheel) > score(fromPalette) ? fromWheel : fromPalette;
}

/** WCAG göreli parlaklık (sRGB). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return 0;
  const n = Number.parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** X119: renkli zemin üstünde okunur metin rengi: siyah ya da beyaz, hangisi daha karşıtsa. */
export function textOn(bg: string): '#111111' | '#ffffff' {
  const l = luminance(bg);
  const dark = (l + 0.05) / (luminance('#111111') + 0.05);
  const light = 1.05 / (l + 0.05);
  return dark >= light ? '#111111' : '#ffffff';
}
