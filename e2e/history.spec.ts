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

test('X88: geçmiş şeridi: simgeli adımlar, tıklanan adıma gidilir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const bar = page.locator('.history-bar');
  await expect(bar.getByRole('button', { name: 'Başlangıç' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Geçmiş/ })).toHaveCount(0);

  // iki boya + kes
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await page.mouse.click(nose.x + 3, nose.y);
  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toBeVisible({ timeout: 60_000 });

  const steps = bar.locator('ol.history li').filter({ hasNot: page.getByLabel('Başlangıç') });
  const n = (await state(page)).undoStack.length;
  await expect(steps).toHaveCount(n);
  // boyama adımı o rengin renginde, son adım kesim ve bulunulan adım
  const red = (await state(page)).slots.find((s: { id: number }) => s.id === 1).color;
  const paintStep = bar.getByRole('button', { name: /\. Fırça · Seçim 1 · \d+ üçgen$/ }).first();
  const rgb = await paintStep.evaluate((el) => getComputedStyle(el).color);
  const hex = `#${rgb
    .match(/\d+/g)
    ?.slice(0, 3)
    .map((v) => Number(v).toString(16).padStart(2, '0'))
    .join('')}`;
  expect(hex).toBe(red.toLowerCase());
  await expect(steps.last()).toHaveClass(/current/);
  await expect(steps.last().getByRole('button')).toHaveAccessibleName(
    /Kes \d+ · Tapa · Seçim 1 → Gövde 1/,
  );

  // ilk adıma tık: sonrakiler soluk
  await steps.first().getByRole('button').click();
  expect((await state(page)).undoStack.length).toBe(1);
  await expect(bar.locator('li.undone')).toHaveCount(n - 1);
  // ◀ başlangıca, ▶| hepsini yineler
  await bar.getByRole('button', { name: 'Geri' }).click();
  expect((await state(page)).undoStack.length).toBe(0);
  await bar.getByRole('button', { name: 'Sona' }).click();
  expect((await state(page)).undoStack.length).toBe(n);
  await expect(bar.locator('li.undone')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/history.png' });
  expect(errors).toEqual([]);
});
