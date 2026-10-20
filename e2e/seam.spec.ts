import { expect, test } from '@playwright/test';

test('X56: Dikiş aracı halkayı boyamadan kapatmaya hazırdır', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Dikiş', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kapat', exact: true })).toBeVisible();
  await expect(page.getByText('Dikiş halkası kapanınca Kes')).toBeVisible();
  await expect(page.getByText('Yüz boşluğu')).toBeVisible();
  expect(errors).toEqual([]);
});
