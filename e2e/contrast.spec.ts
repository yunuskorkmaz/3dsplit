import { expect, type Page, test } from '@playwright/test';

async function screenOf(page: Page, p: number[]): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

/**
 * Metin rengi ile arkasındaki gerçek zemin arasındaki WCAG oranı: yarı saydam zeminler
 * ata zinciri boyunca karıştırılır, `opacity` metne uygulanır.
 */
const contrast = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return -1;
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
    };
    const layers: { r: number; g: number; b: number; a: number }[] = [];
    let opacity = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      opacity *= Number(cs.opacity);
      const bg = parse(cs.backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (bg.a >= 1) break;
    }
    let base = { r: 16, g: 17, b: 20 };
    for (const l of layers.reverse())
      base = {
        r: l.r * l.a + base.r * (1 - l.a),
        g: l.g * l.a + base.g * (1 - l.a),
        b: l.b * l.a + base.b * (1 - l.a),
      };
    const fg0 = parse(getComputedStyle(el).color);
    const a = fg0.a * opacity;
    const fg = {
      r: fg0.r * a + base.r * (1 - a),
      g: fg0.g * a + base.g * (1 - a),
      b: fg0.b * a + base.b * (1 - a),
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const ch = [c.r, c.g, c.b].map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const [hi, lo] = [lum(fg), lum(base)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  }, selector);

test('X119: metin 4,5:1, seçili segment ve odak halkası 3:1', async ({ page }) => {
  await page.goto('/');
  // boş ekranda Dışa aktar gerçekten kapalı (soluk görünmesi muaf)
  const exportMenu = page.locator('details.menu > summary', { hasText: 'Dışa aktar' });
  await expect(exportMenu).toHaveAttribute('aria-disabled', 'true');

  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  // aktif set siyah: rozet ve durum satırı en kötü durum
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const { store } = (window as any).app;
    store.set({
      slots: store
        .get()
        // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
        .slots.map((s: any) => (s.id === 1 ? { ...s, color: '#000000', customColor: true } : s)),
    });
  });
  await page.keyboard.press('1');
  await page.keyboard.press('b');
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect(page.locator('ul.parts li .color-row')).not.toHaveCount(0);
  await page.getByText('Dışa aktar ▾').click();

  const text = {
    'C1 set rozeti': '.slot-chip',
    'C2 durum satırı set adı': '.status-line .set-name',
    'C3 Kes': '.cut-actions button.primary',
    'C4 seçili gövde boyu': 'ul.parts li.selected .size',
    'C5 renk satırı üçgen sayısı': 'ul.parts li .color-row .tris',
    'C7 gelecek adım': '.step-bar li:not(.done):not(.current) button',
    'C8 seçili segment': '.row.segmented button.active',
    'C9 menü açıklaması': '.menu-list small',
    'C11 set numarası': 'ul.slots .key',
  };
  const low: string[] = [];
  for (const [name, sel] of Object.entries(text)) {
    const r = await contrast(page, sel);
    if (r < 4.5) low.push(`${name}: ${r.toFixed(2)}`);
  }
  expect(low).toEqual([]);

  // seçili segment dolgusu çevresine 3:1, odak halkası sarı 2 px
  const fill = await page.evaluate(() => {
    const el = document.querySelector('.row.segmented button.active') as HTMLElement;
    return getComputedStyle(el).backgroundColor;
  });
  expect(fill).toBe('rgb(47, 111, 214)');
  await page.keyboard.press('Escape');
  await page.locator('.cut-actions button.primary').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement as HTMLElement);
    return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`;
  });
  expect(ring).toBe('solid 2px rgb(255, 212, 0)');
  await page.screenshot({ path: 'test-results/contrast.png' });
});
