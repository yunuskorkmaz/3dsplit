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

/** Gövdenin önünde (y < 0) bir nokta; gövde yukarı doğru incelir. */
const front = (x: number, z: number): number[] => {
  const r = 16 - (4 * (z - 10)) / 40;
  return [x, -Math.sqrt(r * r - x * x), z];
};

test('X102: açılan dosya geri alınamaz, boş sahne kaydı silmez', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  expect((await state(page)).undoStack.length).toBe(0);

  // geri al modeli kaldırmaz
  await page.keyboard.press('ControlOrMeta+z');
  expect((await state(page)).parts.length).toBe(1);

  // yarım çizgide geri al son noktayı siler
  await page.keyboard.press('l');
  for (const c of [front(-5, 25), front(5, 25)]) {
    const s = await screenOf(page, c);
    await page.mouse.click(s.x, s.y);
  }
  expect((await state(page)).line.anchors.length).toBe(2);
  await page.keyboard.press('ControlOrMeta+z');
  const s1 = await state(page);
  expect(s1.line.anchors.length).toBe(1);
  expect(s1.parts.length).toBe(1);
  await page.keyboard.press('Escape');

  // başlangıca dönülünce model yerinde
  await page.getByRole('button', { name: 'Başlangıç' }).click();
  expect((await state(page)).parts.length).toBe(1);

  // kayıt yazılsın, sonra sahne boşalsın: kayıt silinmez, yenileyince Devam et çıkar
  await expect
    .poll(async () => (await state(page)).session.savedAt, { timeout: 10_000 })
    .not.toBeNull();
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const app = (window as any).app;
    app.actions.deletePart(app.store.get().parts[0].id);
  });
  expect((await state(page)).parts.length).toBe(0);
  await page.waitForTimeout(2500);
  await page.reload();
  const offer = page.locator('.session-offer');
  await expect(offer.getByRole('button', { name: 'Devam et' })).toBeVisible({ timeout: 10_000 });
  await offer.getByRole('button', { name: 'Devam et' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/undo-base.png' });
  expect(errors).toEqual([]);
});

test('X102: dolu sahneye açılan dosya tek adımda geri alınır', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  // X121: model açıkken dosya açılınca sorulur
  await page.getByRole('button', { name: 'Sahneye ekle' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 30_000 });
  const labels = (await state(page)).undoStack.map((e: { label?: string }) => e.label);
  expect(labels).toEqual(['Aç: figure']);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await state(page)).parts.length).toBe(1);
});
