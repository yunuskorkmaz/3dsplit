import { describe, expect, it } from 'vitest';
import {
  colorDistance,
  luminance,
  MIN_COLOR_DISTANCE,
  pickSlotColor,
  textOn,
} from '../src/state/slotColor';

const PALETTE = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];

describe('X111: yeni set rengi', () => {
  it('kullanılan renklere en uzak palet rengini seçer', () => {
    const used = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'];
    expect(pickSlotColor(PALETTE, used)).toBe('#e67e22');
    // Bluey'in turuncusu varken turuncu verilmez
    const bluey = ['#b0b0b0', '#ffffff', '#0f2c6e', '#1d6a8a', '#000000', '#cf7929'];
    const c = pickSlotColor(PALETTE, bluey);
    expect(colorDistance(c, '#cf7929')).toBeGreaterThan(MIN_COLOR_DISTANCE);
    for (const u of bluey) expect(colorDistance(c, u)).toBeGreaterThan(MIN_COLOR_DISTANCE);
  });

  it('palet tükenince ton çemberinden üretir', () => {
    const c = pickSlotColor(PALETTE, PALETTE);
    expect(PALETTE).not.toContain(c);
    for (const u of PALETTE) expect(colorDistance(c, u)).toBeGreaterThan(0);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('hiç renk yoksa paletin ilki', () => {
    expect(pickSlotColor(PALETTE, [])).toBe('#e74c3c');
  });
});

describe('X119: renkli zeminde okunur metin', () => {
  it('siyah ve koyu zeminde beyaz, açık zeminde siyah; ikisi de 4,5:1 üstü', () => {
    const ratio = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const bg of [
      '#000000',
      '#003384',
      '#ffffff',
      '#cf7929',
      '#e74c3c',
      '#2ecc71',
      '#808080',
    ]) {
      expect(ratio(textOn(bg), bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(textOn('#000000')).toBe('#ffffff');
    expect(textOn('#ffffff')).toBe('#111111');
  });
});
