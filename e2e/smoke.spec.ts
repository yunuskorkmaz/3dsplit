import { expect, type Page, test } from '@playwright/test';

/** Dünya koordinatındaki noktanın ekrandaki yeri (geliştirme kancası üzerinden). */
async function screenOf(
  page: Page,
  p: [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

test('yükle → Smart Fill → Socket kes → 3MF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('ul.parts li input.name')).toHaveValue('figure');

  // yardım penceresi açılıp kapanır
  await page.getByRole('button', { name: /Yardım/ }).click();
  await expect(page.getByRole('dialog', { name: 'Yardım' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Yardım' })).toBeVisible();
  await page.keyboard.press('Escape');

  // kafanın önündeki burun: test figüründe (0, -14, 62)
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.keyboard.press('1');
  await page.mouse.click(nose.x, nose.y);
  const painted = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    return s.parts[0].mesh.labels.filter((l: number) => l === 1).length;
  });
  expect(painted).toBeGreaterThan(50);

  // Socket varsayılan; X78: önizleme Space'siz açılır, sonra kes
  await expect
    .poll(
      () =>
        // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
        page.evaluate(() => (window as any).app.store.get().preview?.volumes?.length ?? 0),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: 'Kesildi' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('ul.parts li')).toHaveCount(3);
  await expect(page.locator('.badge.source')).toHaveCount(1);
  // yalnız yeni parçayı göster, sonra hepsini geri getir
  await page
    .locator('ul.parts li')
    .nth(2)
    .locator('button.eye')
    .click({ modifiers: ['Alt'] });
  await expect(page.locator('ul.parts li.hidden-part')).toHaveCount(2);
  await page.getByRole('button', { name: 'Tümünü göster' }).click();
  await expect(page.locator('ul.parts li.hidden-part')).toHaveCount(1);

  const download = page.waitForEvent('download');
  await page.getByText('Dışa aktar').click();
  await page.getByRole('button', { name: /3MF — Bambu/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.3mf$/);
  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
