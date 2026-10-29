import { expect, test } from '@playwright/test';

test('X125: model yokken araçlar kapalı, kısayol tek ileti, model açılınca etkin', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const ribbon = page.locator('.ribbon');
  const brush = ribbon.getByRole('button', { name: 'Fırça', exact: true });
  await expect(brush).toBeDisabled();
  await expect(brush).toHaveAttribute('title', 'Önce bir model aç.');
  await expect(ribbon.getByRole('button', { name: 'Saydam', exact: true })).toBeDisabled();
  await expect(ribbon.getByRole('button', { name: 'Tapa', exact: true })).toBeDisabled();
  // araç penceresi ve Kes alanı tıklanmaz
  await expect(page.locator('.tool-window')).toHaveAttribute('inert', '');
  await expect(page.locator('.tool-window .status-line')).toContainText('Önce bir model aç.');
  // deneme parçası ve komut arama açık
  await expect(page.getByRole('button', { name: 'Tolerans deneme parçası' })).toBeEnabled();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Komut ara' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Space ve araç kısayolu: tek ileti
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await page.keyboard.press('b');
  await expect(page.locator('.status .msg', { hasText: 'Önce bir model aç.' })).toHaveCount(1);
  await expect(page.locator('.status .msg:not(.busy)')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/no-model.png' });

  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(brush).toBeEnabled();
  await expect(page.locator('.tool-window')).not.toHaveAttribute('inert', '');
  await page.keyboard.press('b');
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  expect(await page.evaluate(() => (window as any).app.store.get().tool)).toBe('brush');
  expect(errors).toEqual([]);
});
