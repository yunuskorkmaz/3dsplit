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

const summary = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    return {
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      parts: s.parts.map((p: any) => ({
        name: p.name,
        badge: p.badge,
        tris: p.mesh.labels.length,
        painted: p.mesh.labels.filter((l: number) => l !== 0).length,
      })),
      selected: s.selectedPartId,
    };
  });

test('X95: yenileyince kaldığın yerden devam', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: 'Kesildi' })).toBeVisible({ timeout: 60_000 });
  // ikinci boya: kesimden sonra da yazılsın
  await page.keyboard.press('2');
  await page.mouse.click(nose.x + 40, nose.y + 60);
  await expect(page.locator('.session-status')).toContainText('Kaydedildi', { timeout: 10_000 });
  const before = await summary(page);

  await page.reload();
  const offer = page.locator('.session-offer');
  await expect(offer).toContainText('2 gövde');
  await offer.getByRole('button', { name: 'Devam et' }).click();
  await expect(offer).toHaveCount(0);
  expect(await summary(page)).toEqual(before);
  await expect(page.locator('.msg', { hasText: 'Oturum kurtarıldı' })).toBeVisible();
  await page.screenshot({ path: 'test-results/session-restored.png' });

  // Yok say kaydı siler
  await page.reload();
  await page.locator('.session-offer').getByRole('button', { name: 'Yok say' }).click();
  // silme bitmeden yenilenirse işlem iptal olur
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.empty-stage')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.session-offer')).toHaveCount(0);
  expect((await state(page)).parts.length).toBe(0);
  expect(errors).toEqual([]);
});
