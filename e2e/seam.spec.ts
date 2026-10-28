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

test('X107: Dikiş panelde ve şeritte yalnız kendi modunu gösterir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const ribbon = page.locator('.ribbon');
  const kes = page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true });

  // boyalı bir seçim varken Dikiş: Kes boyayı kesmez, halka bekler
  await page.keyboard.press('1');
  await page.keyboard.press('f');
  await page.mouse.click(700, 360);
  await ribbon.getByRole('button', { name: 'Dikiş', exact: true }).click();
  await expect(kes).toBeDisabled();

  // mod Tapa iken: şeritte Tapa kapalı ve seçili değil, Yapıştır seçili; panel Tapa ayarı göstermez
  const mode = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    () => (window as any).app.store.get().cut.mode,
  );
  expect(mode).toBe('socket');
  await expect(ribbon.getByRole('button', { name: 'Tapa', exact: true })).toBeDisabled();
  await expect(ribbon.getByRole('button', { name: 'Yapıştır', exact: true })).toHaveClass(/active/);
  await expect(ribbon.getByRole('button', { name: 'Tapa', exact: true })).not.toHaveClass(/active/);
  const panel = page.locator('#kesim');
  await expect(page.locator('.panel-head', { hasText: 'Yapıştır — dikiş' })).toBeVisible();
  await expect(panel).not.toContainText('Göz, kaş, burun');
  await expect(panel).not.toContainText('Derinlik');
  await page.screenshot({ path: 'test-results/seam-panel.png' });

  // Pimli kes: başlık ve şerit birlikte değişir
  await ribbon.getByRole('button', { name: 'Pimli kes', exact: true }).click();
  await expect(page.locator('.panel-head', { hasText: 'Pimli kes — dikiş' })).toBeVisible();
  await expect(panel).toContainText('kesite pim konur');

  // halka hazırsa Kes açılır, halka hatalıysa kapanır
  const ring = (bad: boolean) =>
    page.evaluate((b) => {
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      const app = (window as any).app;
      const s = app.store.get();
      app.store.set({
        line: {
          partId: s.selectedPartId,
          anchors: [0, 1, 2],
          path: [0, 1, 2],
          closed: true,
          bad: b,
        },
      });
    }, bad);
  await ring(false);
  await expect(kes).toBeEnabled();
  await ring(true);
  await expect(kes).toBeDisabled();
  expect(errors).toEqual([]);
});
