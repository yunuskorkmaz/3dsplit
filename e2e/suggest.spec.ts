import { expect, type Page, test } from '@playwright/test';

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

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const mode = (page: Page) => page.evaluate(() => (window as any).app.store.get().cut.mode);

test('X72 boya bitince mod öneriye geçer, elle seçim korunur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  await page.keyboard.press('f');
  expect(await mode(page)).toBe('socket');

  // kol: kalın çıkıntı, mod kendiliğinden Pimli kes
  const arm = await screenOf(page, [32, -4.4, 42]);
  await page.mouse.click(arm.x, arm.y);
  await expect(page.locator('.suggestion')).toContainText('Pimli kes', { timeout: 10_000 });
  await expect.poll(() => mode(page)).toBe('keys');
  await page.screenshot({ path: 'test-results/suggest-arm.png' });

  // elle Tapa: sonraki boya modu değiştirmez
  await page.getByRole('button', { name: 'Tapa', exact: true }).click();
  await page.keyboard.press('2');
  const armR = await screenOf(page, [-32, -4.4, 42]);
  await page.mouse.click(armR.x, armR.y);
  await expect(page.locator('.suggestion')).toContainText('Öneri: Pimli kes', { timeout: 10_000 });
  expect(await mode(page)).toBe('socket');
  expect(errors).toEqual([]);
});
