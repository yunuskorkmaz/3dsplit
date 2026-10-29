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

test('X123: kesimden sonra tapa seçili, Ayrık göster, geri alınca ileti kapanır, tek İptal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect(page.locator('.depth-tag')).toBeVisible({ timeout: 30_000 });

  // kesim sürerken araç penceresinde İptal yok, meşgul kartında var
  const toolCancel = page.locator('.cut-actions').getByRole('button', { name: 'İptal' });
  await expect(toolCancel).toBeVisible();
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg.busy')).toBeVisible();
  await expect(toolCancel).toBeHidden();
  await expect(page.locator('.msg.busy').getByRole('button', { name: 'İptal' })).toBeVisible();

  const msg = page.locator('.msg', { hasText: /^Kes 1: Gövde 1 ayrıldı/ });
  await expect(msg).toBeVisible({ timeout: 60_000 });
  await expect(toolCancel).toBeVisible();

  // seçili parça burun tapası (Gövde 1)
  const s = await state(page);
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  expect(s.parts.find((p: any) => p.id === s.selectedPartId).name).toBe('Gövde 1');
  await expect(page.locator('ul.parts li.selected input.name')).toHaveValue('Gövde 1');

  // Ayrık göster Aralıklı'yı açar
  expect(s.explode).toBe(0);
  await msg.getByRole('button', { name: 'Ayrık göster' }).click();
  expect((await state(page)).explode).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/after-cut.png' });

  // ekranda en çok 3 ileti
  expect((await state(page)).messages.length).toBeLessThanOrEqual(3);

  // geri alınca o kesimin iletileri kapanır
  await page.keyboard.press('ControlOrMeta+z');
  await expect(msg).toHaveCount(0);
  expect(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (await state(page)).messages.filter((m: any) => m.parts?.length),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('X123: ekranda en çok 3 ileti', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const store = (window as any).app.store;
    for (let i = 1; i <= 5; i++) store.notify('info', `ileti ${i}`);
  });
  await expect(page.locator('.status .msg:not(.busy)')).toHaveCount(3);
  await expect(page.locator('.status .msg').first()).toContainText('ileti 3');
});
