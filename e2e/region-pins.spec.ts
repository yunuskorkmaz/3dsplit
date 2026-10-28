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

test('X105: pimler bölgeye bağlı, kesimi geri almak pimleri getirir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // Seçim 1: sağ kol, Seçim 2: sol kol (Akıllı seç)
  await page.keyboard.press('f');
  await page.keyboard.press('1');
  const right = await screenOf(page, [32, -4.4, 42]);
  await page.mouse.click(right.x, right.y);
  await page.keyboard.press('2');
  const left = await screenOf(page, [-32, -4.4, 42]);
  await page.mouse.click(left.x, left.y);

  // Seçim 1'e iki pim
  await page.keyboard.press('1');
  await page.getByRole('button', { name: 'Pimli kes', exact: true }).first().click();
  await page.keyboard.press('p');
  // iki pim birbirinden uzak: yakın tık var olan pimi seçer
  for (const x of [26, 38]) {
    const at = await screenOf(page, [x, -4.4, 42]);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Escape');
  }
  await expect.poll(async () => (await state(page)).pins.length).toBe(2);

  // Seçim 2'ye geçince pimler gelmez; geri dönünce yerinde
  await page.keyboard.press('2');
  expect((await state(page)).pins.length).toBe(0);
  await page.keyboard.press('1');
  expect((await state(page)).pins.length).toBe(2);

  // pim ekleme geri alınınca kendi bölgesine dönülür
  await page.keyboard.press('2');
  await page.keyboard.press('ControlOrMeta+z');
  const undone = await state(page);
  expect(undone.activeSlot).toBe(1);
  expect(undone.pins.length).toBe(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await state(page)).pins.length).toBe(2);

  // kes: pimler sıfırlanır; geri al: aynı set, aynı gövde, iki pim
  const source = (await state(page)).selectedPartId;
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).pins.length).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  const back = await state(page);
  expect(back.pins.length).toBe(2);
  expect(back.activeSlot).toBe(1);
  expect(back.selectedPartId).toBe(source);
  await page.screenshot({ path: 'test-results/region-pins.png' });
  // yinele: kesim yeniden uygulanır, pimler yine kesimde kullanılmış sayılır
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await state(page)).pins.length).toBe(0);
  expect(errors).toEqual([]);
});
