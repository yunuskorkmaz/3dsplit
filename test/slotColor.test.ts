import { describe, expect, it } from 'vitest';
import { colorDistance, MIN_COLOR_DISTANCE, pickSlotColor } from '../src/state/slotColor';

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
