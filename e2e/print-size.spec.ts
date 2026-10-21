import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X71 model ölçüsü ve baskı boyu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const row = page.locator('ul.parts li .size').first();
  await expect(row).toHaveText(/^\d+ mm$/);
  const before = await row.textContent();

  // 5 mm: küçük uyarı
  await page.locator('.print-size-pop summary').click();
  const field = page.locator('.print-size-pop input.num');
  await field.fill('5');
  await page.getByRole('button', { name: 'Ölçekle', exact: true }).click();
  await expect(row).toHaveText('5 mm');
  await expect(page.locator('.print-size.warn')).toContainText("8 mm'den küçük");
  await page.screenshot({ path: 'test-results/print-size-small.png' });

  // geri al: eski boy, uyarı yok
  await page.keyboard.press('Control+z');
  await expect(row).toHaveText(before ?? '');
  await expect(page.locator('.print-size.warn')).toHaveCount(0);
  expect((await state(page)).parts.length).toBe(1);
  expect(errors).toEqual([]);
});
