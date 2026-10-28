import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

async function screenOf(page: Page, p: number[]): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

test('X110: kesilmemiş renk ve gizli gövde menüde, eşleme kapanmayan iletide', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // burun Seçim 1; kol Seçim 2 (kesilmeyecek renk)
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.keyboard.press('1');
  await page.mouse.click(nose.x, nose.y);
  const arm = await screenOf(page, [32, -4.4, 42]);
  await page.keyboard.press('2');
  await page.mouse.click(arm.x, arm.y);
  await expect.poll(async () => (await state(page)).parts[0].mesh.labels.includes(2)).toBe(true);
  await page.keyboard.press('1');
  await expect
    .poll(
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      () => page.evaluate(() => (window as any).app.store.get().preview?.volumes?.length ?? 0),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('ul.parts li')).toHaveCount(3);

  // tapayı gizle: dosyaya girmez
  await page
    .locator('ul.parts li', { has: page.locator('input.name[value="Gövde 1"]') })
    .locator('button.eye')
    .click();

  const menu = page.locator('details.menu');
  await page.getByText('Dışa aktar ▾').click();
  const notes = menu.locator('.export-note');
  await expect(notes).toHaveCount(2);
  await expect(notes.nth(0)).toHaveText(
    'figure: kesilmemiş 1 renk (Seçim 2); dosyada gövde tek renk olur.',
  );
  await expect(notes.nth(1)).toHaveText('1 gizli gövde dosyaya girmez.');
  await expect(menu.locator('.last-export')).toHaveCount(0);

  // satıra tık: gövde ve Seçim 2 seçilir, menü kapanır
  await notes.nth(0).click();
  const s = await state(page);
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  expect(s.parts.find((p: any) => p.id === s.selectedPartId).name).toBe('figure');
  expect(s.activeSlot).toBe(2);
  await expect(menu).not.toHaveAttribute('open', '');

  // Bambu 3MF: ileti kapanmaz, eşleme gövde adlarıyla
  const download = page.waitForEvent('download');
  await page.getByText('Dışa aktar ▾').click();
  await page.getByRole('button', { name: /3MF — Bambu/ }).click();
  await download;
  const msg = page.locator('.msg', { hasText: '3MF hazır: 1 gövde, 1 filament.' });
  await expect(msg).toBeVisible();
  await expect(msg.locator('.filament-list li')).toHaveText(['Filament 1 — Taban: figure']);
  await page.waitForTimeout(9_000);
  await expect(msg).toBeVisible();

  // eşleme menüde de durur
  await page.getByText('Dışa aktar ▾').click();
  await expect(menu.locator('.last-export li')).toHaveText(['Filament 1 — Taban: figure']);
  await page.screenshot({ path: 'test-results/export-report.png' });
  await msg.click();
  await expect(msg).toHaveCount(0);
  expect(errors).toEqual([]);
});
