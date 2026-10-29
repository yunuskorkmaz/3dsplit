import { expect, test } from '@playwright/test';

test('X117: açılamayan dosyada Türkçe ve eylemli ileti', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const input = page.locator('input[type=file]');

  // rastgele baytlı STL: ham istisna metni değil
  const junk = Buffer.alloc(5000);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919 + 13) % 256;
  await input.setInputFiles({ name: 'bozuk.stl', mimeType: 'model/stl', buffer: junk });
  await expect(
    page.locator('.msg', {
      hasText:
        "Dosya okunamadı: bozuk.stl. Bozuk ya da başka bir biçimde olabilir. Slicer'dan yeniden STL ya da 3MF olarak kaydedip dene.",
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.msg', { hasText: /Invalid|typed array/ })).toHaveCount(0);

  // desteklenmeyen tür: desteklenenler sayılır
  await input.setInputFiles({ name: 'not.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(
    page.locator('.msg', { hasText: '.txt açılamaz. STL, OBJ, 3MF ya da .3dsplit dosyası seç.' }),
  ).toBeVisible();
  await expect(page.locator('ul.parts li')).toHaveCount(0);
  expect(errors).toEqual([]);
});
