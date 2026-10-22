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

test('X96: sadeleştirme, öneri kartı, gizli kaynak GPU’da tutulmaz', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const tris = () => state(page).then((s) => s.parts[0].mesh.labels.length as number);
  const before = await tris();

  // öneri kartı (eşik büyük modelde; burada elle açılır)
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const app = (window as any).app;
    const s = app.store.get();
    app.store.set({ simplifyOffer: { partIds: [s.parts[0].id], triangles: 1_470_000 } });
  });
  const card = page.locator('.notice-card');
  await expect(card).toContainText('1,47 milyon');
  await card.getByRole('button', { name: 'Olduğu gibi kalsın' }).click();
  await expect(card).toHaveCount(0);

  // komut aramadan sadeleştir: yarıya iner, Ctrl+Z geri getirir
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Komut ara' }).fill('sadeleştir');
  await page.keyboard.press('Enter');
  await expect(page.locator('.msg', { hasText: 'Sadeleştirildi' })).toBeVisible({
    timeout: 30_000,
  });
  const after = await tris();
  expect(after).toBeLessThanOrEqual(before / 2);
  expect(after).toBeGreaterThan(before / 20);
  await page.keyboard.press('Control+z');
  expect(await tris()).toBe(before);

  // kesimden sonra gizli kaynak sahnede (GPU'da) değil; gösterilince kurulur
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: 'Kesildi' })).toBeVisible({ timeout: 60_000 });
  const inScene = () =>
    page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      const w = window as any;
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      const src = w.app.store.get().parts.find((p: any) => p.badge === 'source');
      return w.viewport.parts.has(src.id) as boolean;
    });
  expect(await inScene()).toBe(false);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const w = window as any;
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const src = w.app.store.get().parts.find((p: any) => p.badge === 'source');
    w.app.actions.toggleVisible(src.id);
  });
  expect(await inScene()).toBe(true);
  expect(errors).toEqual([]);
});
