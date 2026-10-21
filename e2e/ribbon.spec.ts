import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X84: simgeli şerit; araçlar şeritten seçilir, Mesh paneli yok', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const ribbon = page.locator('.ribbon');
  for (const g of ['Seç', 'Kes', 'Mesh', 'Düzen'])
    await expect(ribbon.getByRole('group', { name: g })).toBeVisible();
  await expect(ribbon.locator('svg.icon').first()).toBeVisible();

  const tools: [string, string][] = [
    ['Fırça', 'brush'],
    ['Silgi', 'erase'],
    ['Yumuşat', 'smooth'],
    ['Kova', 'bucket'],
    ['Çizgi', 'line'],
    ['Dikiş', 'seam'],
    ['Akıllı seç', 'smart'],
  ];
  for (const [name, id] of tools) {
    await ribbon.getByRole('button', { name, exact: true }).click();
    expect((await state(page)).tool).toBe(id);
  }
  // Pim yalnız Pimli kes'te
  const pin = ribbon.getByRole('button', { name: 'Pim', exact: true });
  await ribbon.getByRole('button', { name: 'Tapa', exact: true }).click();
  await expect(pin).toBeDisabled();
  await ribbon.getByRole('button', { name: 'Pimli kes', exact: true }).click();
  await pin.click();
  expect((await state(page)).tool).toBe('pin');

  await ribbon.getByRole('button', { name: 'Aralıklı', exact: true }).click();
  expect((await state(page)).explode).toBeGreaterThan(0);
  await ribbon.getByRole('button', { name: 'Saydam', exact: true }).click();
  expect((await state(page)).xray).toBe(true);

  // açılır kutu dışarı tıklayınca kapanır
  await page.locator('.print-size-pop summary').click();
  await expect(page.locator('.print-size-pop .pop-body')).toBeVisible();
  await page.locator('.topbar .brand').click();
  await expect(page.locator('.print-size-pop .pop-body')).toBeHidden();

  await expect(page.getByRole('heading', { name: 'Mesh araçları' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ribbon.png' });
  expect(errors).toEqual([]);
});
