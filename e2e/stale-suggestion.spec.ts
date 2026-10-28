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
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X103: set değişince eski öneri kalkar, öneri gelene kadar Kes kapalı', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const kes = page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true });

  // Seçim 1: kol → Pimli kes; Seçim 2: burun → Tapa
  await page.keyboard.press('1');
  await page.keyboard.press('f');
  const arm = await screenOf(page, [32, -4.4, 42]);
  await page.mouse.click(arm.x, arm.y);
  await expect(page.locator('.suggestion')).toContainText('Pimli kes', { timeout: 10_000 });
  await page.keyboard.press('2');
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect(page.locator('.suggestion')).toContainText('Tapa', { timeout: 10_000 });
  expect((await state(page)).cut.mode).toBe('socket');

  // Seçim 1'e dönünce burnun önerisi hemen kalkar, Kes bekler. Öneri yükte çok çabuk
  // gelebilir: bekleme kartının görünüp Kes'in o sırada kapalı olduğu gözlemciyle yakalanır.
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test kaydı
    const w = window as any;
    w.pendingSeen = { card: false, kesOpen: false };
    new MutationObserver(() => {
      if (!document.querySelector('.suggestion-pending')) return;
      w.pendingSeen.card = true;
      const btn = [...document.querySelectorAll<HTMLButtonElement>('.cut-actions button')].find(
        (b) => b.textContent?.trim() === 'Kes',
      );
      if (btn && !btn.disabled) w.pendingSeen.kesOpen = true;
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await page.keyboard.press('1');
  const s = await state(page);
  expect(s.suggesting).toBe(true);
  expect(s.suggestion).toBeNull();
  await expect(page.locator('.suggestion')).toContainText('Pimli kes', { timeout: 10_000 });
  await expect(kes).toBeEnabled();
  expect((await state(page)).cut.mode).toBe('keys');
  // biome-ignore lint/suspicious/noExplicitAny: test kaydı
  expect(await page.evaluate(() => (window as any).pendingSeen)).toEqual({
    card: true,
    kesOpen: false,
  });

  // "Bu seti kes" gibi: set değişip hemen kesilirse önce o setin önerisi beklenir
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const app = (window as any).app;
    app.store.set({ activeSlot: 2 });
    app.actions.runCut();
  });
  await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toContainText('Tapa', {
    timeout: 60_000,
  });
  expect(errors).toEqual([]);
});
