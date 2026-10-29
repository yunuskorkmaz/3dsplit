import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { parse3mf } from '../src/io/threeMf';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X115: deneme parçası boş ekrandan açılır, ayrı indirilir, sahneye girmez', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Tolerans deneme parçası' }).click();
  const bar = page.getByRole('toolbar', { name: 'Tolerans deneme parçası' });
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await expect(bar).toContainText('boşluklar 0,1 / 0,2 / 0,3 mm');
  await expect(bar.locator('.coupon-picker button')).toHaveText([
    '1 çentik 0,1',
    '2 çentik 0,2',
    '3 çentik 0,3',
  ]);
  await expect(bar).toContainText('Pim: silindir Ø8 × 6 mm');
  await expect(page.locator('.side-left')).toHaveCount(0);
  expect((await state(page)).coupon.parts.length).toBe(4);

  // Pimli kes: kesim ayarlarındaki pim
  await bar.getByRole('button', { name: 'Pimli kes' }).click();
  await expect(bar.getByRole('button', { name: 'Pimli kes' })).toHaveClass(/active/);
  await page.screenshot({ path: 'test-results/coupon-view.png' });

  // İndir: dosyada yalnız plaka ve pimler
  const download = page.waitForEvent('download');
  await bar.getByText('İndir ▾').click();
  await bar.getByRole('button', { name: '3MF — Bambu Studio / OrcaSlicer' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tolerans-deneme.3mf');
  const parsed = parse3mf(new Uint8Array(readFileSync((await file.path()) as string)));
  expect(parsed.objects.map((o) => o.name)).toEqual([
    'Tolerans plakası (0,1 / 0,2 / 0,3 mm)',
    'Tolerans pimi 1',
    'Tolerans pimi 2',
    'Tolerans pimi 3',
  ]);

  // Esc modele (boş ekrana) döner; sahne ve geçmiş boş
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Örnek modeli aç' })).toBeVisible();
  const s = await state(page);
  expect(s.parts.length).toBe(0);
  expect(s.undoStack.length).toBe(0);
  expect(errors).toEqual([]);
});

test('X115: model açıkken komut aramadan açılır, model aynı kalır', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.step-bar li.current')).toHaveText('Seç');
  const before = await state(page);

  await page.locator('.topbar .search-btn').click();
  await page.getByRole('textbox', { name: 'Komut ara' }).fill('tolerans');
  await page.keyboard.press('Enter');
  const bar = page.getByRole('toolbar', { name: 'Tolerans deneme parçası' });
  await expect(bar).toBeVisible({ timeout: 30_000 });
  // model çizilmez; araç kısayolu çalışmaz
  const drawn = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    () => [...(window as any).viewport.parts.keys()],
  );
  expect(drawn).not.toContain(before.parts[0].id);
  await page.keyboard.press('b');
  expect((await state(page)).tool).toBe(before.tool);

  await bar.getByRole('button', { name: 'Kapat' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(1);
  const after = await state(page);
  expect(after.parts.map((p: { id: string }) => p.id)).toEqual(
    before.parts.map((p: { id: string }) => p.id),
  );
  expect(after.parts[0].visible).toBe(true);
  expect(after.undoStack.length).toBe(before.undoStack.length);
  await expect(page.locator('.step-bar li.current')).toHaveText('Seç');
  expect(errors).toEqual([]);
});
