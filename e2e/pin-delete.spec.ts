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

const painted = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const m = (window as any).app.store.get().parts[0].mesh;
    let n = 0;
    for (const l of m.labels) if (l === 2) n++;
    return n;
  });

test('X122: Delete önizlemede yalnız seçili pimi siler, boyaya dokunmaz', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // gövdenin önüne çizgiyle kare bölge (Seçim 2)
  const front = (x: number, z: number): [number, number, number] => {
    const r = 16 - (4 * (z - 10)) / 40;
    return [x, -Math.sqrt(r * r - x * x), z];
  };
  await page.keyboard.press('2');
  await page.keyboard.press('l');
  for (const c of [front(-5, 25), front(5, 25), front(5, 35), front(-5, 35), front(-5, 25)]) {
    const s = await screenOf(page, c);
    await page.mouse.click(s.x, s.y);
  }
  await expect(page.locator('.msg', { hasText: 'Çizgi kapatıldı' })).toBeVisible();
  const paint = await painted(page);
  expect(paint).toBeGreaterThan(50);

  // Pimli kes önizlemesi, iki elle konmuş pim
  await page.getByRole('button', { name: 'Pimli kes', exact: true }).first().click();
  await expect
    .poll(async () => (await state(page)).preview !== null, { timeout: 30_000 })
    .toBe(true);
  await page.keyboard.press('p');
  const pinAt = await screenOf(page, front(0, 30));
  await page.mouse.click(pinAt.x, pinAt.y);
  const empty = await screenOf(page, front(8, 15));
  await page.mouse.click(empty.x, empty.y);
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(async () => (await state(page)).pins.length).toBe(2);
  expect((await state(page)).selectedPin).toBe(1);

  // pim seçiliyken Delete: bir pim gider
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await state(page)).pins.length).toBe(1);
  expect((await state(page)).selectedPin).toBe(-1);

  // pim seçili değilken Delete: boya ve pim aynı, ileti
  await page.keyboard.press('Delete');
  await expect(
    page.locator('.msg', { hasText: 'Silinecek pim seçili değil. Pime tıkla, sonra Delete.' }),
  ).toBeVisible();
  expect((await state(page)).pins.length).toBe(1);
  expect(await painted(page)).toBe(paint);

  // önizleme ve pim aracı dışında Delete seti temizler, iletiyle
  await page.keyboard.press('s');
  await page.getByRole('checkbox', { name: /Önizleme/ }).uncheck();
  await expect.poll(async () => (await state(page)).previewActive).toBe(false);
  await page.locator('canvas').first().focus();
  await page.keyboard.press('Delete');
  await expect(
    page.locator('.msg', {
      hasText: `Seçim 2 temizlendi (${paint.toLocaleString('tr-TR')} üçgen). Ctrl+Z geri getirir.`,
    }),
  ).toBeVisible();
  expect(await painted(page)).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await painted(page)).toBe(paint);
  expect(errors).toEqual([]);
});
