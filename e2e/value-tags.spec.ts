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

test('X89: Tapa derinliği, pim ölçüsü ve fırça çapı model üstünde', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // fırça çapı: ] ile değişince imleç yanında
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.move(nose.x, nose.y);
  await page.keyboard.press(']');
  await expect(page.locator('.brush-tag')).toContainText('Ø');
  await expect(page.locator('.brush-tag')).toHaveCount(0, { timeout: 3000 });

  // burun Tapa: önizlemede derinlik kutusu; yazınca uygulanır
  await page.mouse.click(nose.x, nose.y);
  await page.locator('.ribbon').getByRole('button', { name: 'Tapa', exact: true }).click();
  const depth = page.locator('.depth-tag');
  await expect(depth).toBeVisible({ timeout: 30_000 });
  await expect(depth).toHaveText('3 mm');
  await depth.getByRole('button').click();
  await depth.getByLabel('Derinlik').fill('5');
  await depth.getByLabel('Derinlik').press('Enter');
  expect((await state(page)).cut.depth).toBe(5);
  await expect(depth).toHaveText('5 mm');
  await page.screenshot({ path: 'test-results/value-tags-depth.png' });

  // arkadan bakınca kutu gizlenir
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (window as any).viewport.viewToward(
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      new (window as any).viewport.camera.position.constructor(0, 1, 0.2),
    );
  });
  await expect(depth).toHaveCount(0);

  // Pimli kes: seçili pimin çapı ve boyu
  await page.locator('.ribbon').getByRole('button', { name: 'Pimli kes', exact: true }).click();
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (window as any).viewport.viewToward(
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      new (window as any).viewport.camera.position.constructor(0, -1, 0.6),
    );
  });
  await expect
    .poll(async () => (await state(page)).pinLayout.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const app = (window as any).app;
    const l = app.store.get().pinLayout[0];
    app.store.set({ pins: [{ point: l.surface }], selectedPin: 0 });
  });
  const pin = page.locator('.pin-tag');
  await expect(pin).toBeVisible();
  await pin.getByRole('button').click();
  await pin.getByLabel('Ø').fill('4');
  await pin.getByLabel('Boy').fill('10');
  await pin.getByLabel('Boy').press('Enter');
  const p = (await state(page)).pins[0];
  expect(p.radius).toBe(2);
  expect(p.length).toBe(10);
  await expect(pin).toHaveText('Ø 4 · 10 mm');
  await page.screenshot({ path: 'test-results/value-tags-pin.png' });
  expect(errors).toEqual([]);
});
