import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

async function screenOf(page: Page, p: number[]): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

const summary = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    return {
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      parts: s.parts.map((p: any) => ({
        name: p.name,
        badge: p.badge,
        tris: p.mesh.labels.length,
        painted: p.mesh.labels.filter((l: number) => l !== 0).length,
      })),
      selected: s.selectedPartId,
    };
  });

test('X95: yenileyince kaldığın yerden devam', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toBeVisible({ timeout: 60_000 });
  // ikinci boya: kesimden sonra da yazılsın
  const { paintVersion } = await state(page);
  await page.keyboard.press('2');
  // açılıştaki ve kesimdeki kayıtlar da "Kaydedildi" yazar: boyadan sonra alınan kaydı bekle.
  // savedAt kaydın alındığı an; tıktan önce alınan kayıt boyayı içermez
  const clicked = await page.evaluate(() => Date.now());
  await page.mouse.click(nose.x + 40, nose.y + 60);
  await expect.poll(async () => (await state(page)).paintVersion).toBeGreaterThan(paintVersion);
  await expect
    .poll(async () => (await state(page)).session.savedAt ?? 0, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(clicked);
  await expect(page.locator('.session-status')).toContainText('Kaydedildi', { timeout: 10_000 });
  const before = await summary(page);

  await page.reload();
  const offer = page.locator('.session-offer');
  await expect(offer).toContainText('2 gövde');
  await offer.getByRole('button', { name: 'Devam et' }).click();
  await expect(offer).toHaveCount(0);
  expect(await summary(page)).toEqual(before);
  await expect(page.locator('.msg', { hasText: 'Oturum kurtarıldı' })).toBeVisible();
  await page.screenshot({ path: 'test-results/session-restored.png' });

  // X106: Yok say yalnız kartı kapatır; kayıt silinmez, yenileyince yine önerilir
  await page.reload();
  await page.locator('.session-offer').getByRole('button', { name: 'Yok say' }).click();
  await expect(page.locator('.session-offer')).toHaveCount(0);
  await expect(page.locator('.empty-stage')).toBeVisible();
  await page.reload();
  await expect(page.locator('.session-offer')).toContainText('2 gövde');
  expect((await state(page)).parts.length).toBe(0);
  expect(errors).toEqual([]);
});

test('X106: yeni model kayıtlı oturumu ezmez, Önceki oturumu aç geri getirir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const palette = page.getByRole('dialog', { name: 'Komut ara' });
  const run = async (text: string) => {
    await page.keyboard.press('Control+k');
    await palette.getByRole('textbox', { name: 'Komut ara' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(palette).toHaveCount(0);
  };
  const names = async () =>
    (await state(page)).parts.map((p: { name: string }) => p.name).join(',');
  const savedAfter = async (t: number) =>
    expect
      .poll(async () => (await state(page)).session.savedAt ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(t);

  // figure açılır ve kaydedilir
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await savedAfter(0);

  // yenile: kart açıkken örnek model açılır; figure "önceki" olarak saklanır
  await page.reload();
  await expect(page.locator('.session-offer')).toContainText('figure');
  await page.getByRole('button', { name: 'Örnek modeli aç' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.msg', { hasText: 'Önceki çalışma saklandı' })).toBeVisible();
  await savedAfter(0);
  expect(await names()).toBe('örnek figür');

  // önceki oturum geri gelir; ekrandaki çalışma yerine "önceki" olur
  await run('önceki oturum');
  await expect.poll(names).toBe('figure');
  const t = (await state(page)).session.savedAt ?? 0;
  await savedAfter(t);
  await run('önceki oturum');
  await expect.poll(names).toBe('örnek figür');
  await page.screenshot({ path: 'test-results/session-previous.png' });
  expect(errors).toEqual([]);
});
