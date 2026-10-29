import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X121: model açıkken ikinci dosya sorar: Yerine aç, Sahneye ekle, Vazgeç', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const input = page.locator('input[type=file]');
  const card = page.getByRole('region', { name: 'Dosya açma' });
  const names = async () =>
    (await state(page)).parts.map((p: { name: string }) => p.name).join(',');
  const savedAfter = async (t: number) =>
    expect
      .poll(async () => (await state(page)).session.savedAt ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(t);

  await page.goto('/');
  await input.setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // Vazgeç: sahne aynı
  await input.setInputFiles('samples/testa.stl');
  await expect(card).toContainText('testa.stl açılıyor.');
  await card.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(card).toHaveCount(0);
  expect(await names()).toBe('figure');

  // Yerine aç: tek gövde, bugünkü sahne saklanır
  await input.setInputFiles('samples/testa.stl');
  await page.screenshot({ path: 'test-results/open-ask.png' });
  await card.getByRole('button', { name: 'Yerine aç' }).click();
  await expect.poll(names, { timeout: 30_000 }).toBe('testa');
  // eski sahne açmadan önce yazıldı; şimdiki kayıt testa olmalı
  const before = (await state(page)).session.savedAt ?? 0;
  await expect(page.locator('.msg', { hasText: 'Önceki çalışma saklandı' })).toBeVisible();
  expect((await state(page)).undoStack).toEqual([]);
  await savedAfter(before);

  // Önceki oturumu aç ilk sahneyi getirir
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Komut ara' });
  await palette.getByRole('textbox', { name: 'Komut ara' }).fill('önceki oturum');
  await page.keyboard.press('Enter');
  await expect.poll(names).toBe('figure');

  // Sahneye ekle: iki gövde
  await input.setInputFiles('samples/testa.stl');
  await card.getByRole('button', { name: 'Sahneye ekle' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 30_000 });
  expect(await names()).toBe('figure,testa');
  expect(errors).toEqual([]);
});
