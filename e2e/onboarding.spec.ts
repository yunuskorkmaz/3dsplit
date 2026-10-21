import { expect, type Page, test } from '@playwright/test';

async function screenOf(page: Page, p: number[]): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

test('X83: örnek model ve adım çubuğu: Aç → Seç → Kes → Aktar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const current = page.locator('.step-bar li.current');
  await expect(current).toHaveText('Aç');
  // model yokken Renkler ve Kesim soluk ve kapalı
  await expect(page.locator('section.panel.disabled')).toHaveCount(2);
  await expect(page.locator('ul.slots')).toHaveCount(0);

  await page.getByRole('button', { name: 'Örnek modeli aç' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(current).toHaveText('Seç');
  await expect(page.locator('.step-bar li.done')).toHaveText(['✓ Aç']);
  await expect(page.locator('section.panel.disabled')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/onboarding-select.png' });

  // fırçayla burun
  await page.keyboard.press('1');
  await page.locator('.ribbon button').nth(1).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect(current).toHaveText('Kes');

  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: 'Kesildi' })).toBeVisible({ timeout: 60_000 });
  await expect(current).toHaveText('Aktar');
  await page.screenshot({ path: 'test-results/onboarding-export.png' });
  // Aktar adımı Dışa aktar menüsünü açar
  await current.locator('button').click();
  await expect(page.getByRole('button', { name: /3MF — Bambu/ })).toBeVisible();
  expect(errors).toEqual([]);
});
