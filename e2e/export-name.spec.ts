import { expect, type Page, test } from '@playwright/test';

async function exportAs(page: Page, item: RegExp): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByText(/^Dışa aktar/).click();
  await page.getByRole('button', { name: item }).click();
  return (await download).suggestedFilename();
}

test('X126: dışa aktarılan dosyanın adı açılan dosyadan gelir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  expect(await exportAs(page, /3MF — Bambu/)).toBe('figure-parcalar.3mf');
  expect(await exportAs(page, /3MF — genel/)).toBe('figure-genel.3mf');
  expect(await exportAs(page, /STL \(ZIP\)/)).toBe('figure-parcalar.zip');

  // gövde adı geçersiz karakter taşırsa tek STL'de yalnız o karakter değişir
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const { actions, store } = (window as any).app;
    actions.renamePart(store.get().parts[0].id, 'Göz: sağ/sol (0,2 mm)');
  });
  expect(await exportAs(page, /^Seçili parça — STL/)).toBe('Göz- sağ-sol (0,2 mm).stl');
  expect(errors).toEqual([]);
});

test('X126: örnek model ornek-figur adını alır', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Örnek modeli aç' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  expect(await exportAs(page, /3MF — Bambu/)).toBe('ornek-figur-parcalar.3mf');
});
