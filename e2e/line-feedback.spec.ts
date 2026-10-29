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

// gövdenin önü (y < 0), yarıçap z ile azalır
const front = (x: number, z: number): number[] => {
  const r = 16 - (4 * (z - 10)) / 40;
  return [x, -Math.sqrt(r * r - x * x), z];
};

test('X112: kendini kesen halka boyamaz, halka yalnız ilk noktada kapanır', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('2');
  await page.keyboard.press('l');

  // papyon: köşegenler kesişir
  for (const c of [front(-5, 25), front(5, 35), front(5, 25), front(-5, 35)]) {
    const s = await screenOf(page, c);
    await page.mouse.click(s.x, s.y);
  }
  await page.keyboard.press('Enter');
  await expect(
    page.locator('.msg', { hasText: 'Çizgi kendini kesiyor; noktaları kesişmeyecek sırayla koy.' }),
  ).toBeVisible();
  expect(await painted(page)).toBe(0);
  expect((await state(page)).undoStack.length).toBe(0);
  await page.keyboard.press('Escape');

  // kare halka
  for (const c of [front(-5, 25), front(5, 25), front(5, 35), front(-5, 35)]) {
    const s = await screenOf(page, c);
    await page.mouse.click(s.x, s.y);
  }
  const { first, size } = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const p = (window as any).app.actions.linePreview();
    return { first: p.anchors[0], size: p.size };
  });
  // ilk noktaya yakın ama işaretin dışında: yeni nokta
  const near = await screenOf(page, [first[0] - 1.7 * size, first[1], first[2]]);
  await page.mouse.click(near.x, near.y);
  expect((await state(page)).line.anchors.length).toBe(5);
  expect(await painted(page)).toBe(0);

  // ilk noktanın üstünde: nokta vurgulanır, tık kapatır
  const at = await screenOf(page, first);
  await page.mouse.move(at.x, at.y);
  await expect
    .poll(() =>
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      page.evaluate(() => (window as any).viewport.lineHot),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/line-first-hot.png' });
  await page.mouse.click(at.x, at.y);
  const msg = page.locator('.msg', { hasText: /^Çizgi kapatıldı: [\d.]+ üçgen boyandı\./ });
  await expect(msg).toBeVisible();
  // ileti yumuşatmadan sonraki sayıyı yazar
  const n = Number((await msg.textContent())?.match(/([\d.]+) üçgen/)?.[1].replace(/\./g, ''));
  expect(n).toBe(await painted(page));
  expect(n).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});
