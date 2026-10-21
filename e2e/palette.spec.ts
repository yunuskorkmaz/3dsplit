import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X90: Ctrl+K komut arama', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const palette = page.getByRole('dialog', { name: 'Komut ara' });
  const input = palette.getByRole('textbox', { name: 'Komut ara' });
  const first = palette.locator('.palette-list li button').first();

  // kısayol dinleyicisi kurulana kadar bekle
  await expect(page.locator('.topbar .search-btn')).toBeVisible();
  await expect(page.locator('.step-bar li.current')).toHaveText('Aç');
  // parça yokken çalışmayan komut soluk, nedeni yanında
  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.fill('onar');
  await expect(first).toHaveClass(/blocked/);
  await expect(first).toContainText('seçili parça yok');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);

  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // Türkçe harf duyarsız
  await page.locator('.topbar .search-btn').click();
  await input.fill('yapistir');
  await expect(first.locator('.pl')).toHaveText('Yapıştır');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await input.fill('pimli');
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  expect((await state(page)).cut.mode).toBe('keys');

  // ↓ ile seçip çalıştırma; boşken son kullanılan en üstte
  await page.keyboard.press('Control+k');
  await expect(first.locator('.pl')).toHaveText('Pimli kes');
  await input.fill('görünüş');
  await page.keyboard.press('ArrowDown');
  await expect(palette.locator('.palette-list li button.active .pl')).toHaveText('Görünüş: Arka');
  await page.screenshot({ path: 'test-results/palette.png' });
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);

  // araç
  await page.keyboard.press('Control+k');
  await input.fill('firca');
  await page.keyboard.press('Enter');
  expect((await state(page)).tool).toBe('brush');
  expect(errors).toEqual([]);
});
