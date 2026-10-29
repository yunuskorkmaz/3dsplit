import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

async function openFigure(page: Page) {
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
}

async function reloadAndDismiss(page: Page) {
  await page.reload();
  const offer = page.locator('.session-offer');
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await offer.getByRole('button', { name: 'Yok say' }).click();
  await expect(offer).toHaveCount(0);
}

test('X116: tolerans kalıcı, deneme parçasının çentiğinden seçilir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await openFigure(page);
  const panel = page.locator('.tool-window');
  await expect(panel.getByRole('button', { name: 'Normal 0,2' })).toHaveClass(/active/);
  await panel.getByRole('button', { name: 'Gevşek 0,3' }).click();
  await expect.poll(async () => (await state(page)).session.savedAt ?? 0).toBeGreaterThan(0);

  // yenile, kayıtlı oturumu yok say, yeni model: Gevşek seçili kalır
  await reloadAndDismiss(page);
  await openFigure(page);
  await expect(panel.getByRole('button', { name: 'Gevşek 0,3' })).toHaveClass(/active/);
  await expect(panel.locator('.coupon-picker')).toHaveCount(0);

  // deneme parçası: Gevşek etrafında 0,2 / 0,3 / 0,4
  await panel.getByRole('button', { name: 'Deneme parçası üret' }).click();
  const bar = page.getByRole('toolbar', { name: 'Tolerans deneme parçası' });
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  const picker = panel.locator('.coupon-picker');
  await expect(picker).toContainText('Son deneme parçası (Tapa, silindir Ø8 × 6 mm):');
  await expect(picker.getByRole('button')).toHaveText([
    '1 çentik 0,2',
    '2 çentik 0,3',
    '3 çentik 0,4',
  ]);
  await picker.getByRole('button', { name: '3 çentik 0,4' }).click();
  expect((await state(page)).cut.clearance).toBe(0.4);
  await expect(panel.getByRole('button', { name: /^(Sıkı|Normal|Gevşek)/ })).not.toHaveClass([
    /active/,
    /active/,
    /active/,
  ]);
  await page.screenshot({ path: 'test-results/tolerance-picker.png' });

  // yenilemeden sonra eşleme ve seçilen değer durur
  await reloadAndDismiss(page);
  await openFigure(page);
  await expect(picker.getByRole('button', { name: '3 çentik 0,4' })).toHaveClass(/active/);
  expect((await state(page)).cut.clearance).toBe(0.4);
  expect(errors).toEqual([]);
});

test('X116: tolerans 0 iken deneme parçasında üç delik', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const { store } = (window as any).app;
    store.set({ cut: { ...store.get().cut, clearance: 0 } });
  });
  await page.getByRole('button', { name: 'Tolerans deneme parçası' }).click();
  const bar = page.getByRole('toolbar', { name: 'Tolerans deneme parçası' });
  await expect(bar).toContainText('boşluklar 0 / 0,1 / 0,2 mm', { timeout: 30_000 });
  expect((await state(page)).coupon.parts.length).toBe(4);
});
