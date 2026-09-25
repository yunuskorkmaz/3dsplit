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

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X36 çizgi aracı, X35 deneme parçası, X27 ayrık görünüm', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // gövdenin önüne (y < 0) kare halka: x ±5, z 25..35 (gövde yarıçapı ~14)
  const front = (x: number, z: number): [number, number, number] => {
    const r = 16 - (4 * (z - 10)) / 40;
    return [x, -Math.sqrt(r * r - x * x), z];
  };
  const corners = [front(-5, 25), front(5, 25), front(5, 35), front(-5, 35)];
  const trisBefore = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    () => (window as any).app.store.get().parts[0].mesh.labels.length,
  );
  await page.keyboard.press('2');
  await page.keyboard.press('l');
  for (const c of corners) {
    const s = await screenOf(page, c);
    await page.mouse.click(s.x, s.y);
  }
  expect((await state(page)).line.anchors.length).toBe(4);
  const first = await screenOf(page, corners[0]);
  await page.mouse.click(first.x, first.y);
  await expect(page.locator('.msg', { hasText: 'Çizgi kapatıldı' })).toBeVisible();
  const after = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const m = (window as any).app.store.get().parts[0].mesh;
    let painted = 0;
    for (const l of m.labels) if (l === 2) painted++;
    return { painted, tris: m.labels.length };
  });
  expect(after.painted).toBeGreaterThan(50);
  // kenar çizgi boyunca üçgenlerin içinden geçti: üçgen sayısı arttı
  expect(after.tris).toBeGreaterThan(trisBefore);

  // X44: aynayla (X ekseni, figür x=0'da simetrik) sağda çizilen halka solda da boyanır
  await page.keyboard.press('3');
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (window as any).app.store.set({ mirror: { enabled: true, axis: 0, offset: null } });
  });
  for (const c of [front(3, 14), front(9, 14), front(9, 20), front(3, 20), front(3, 14)]) {
    const s = await screenOf(page, c);
    await page.mouse.click(s.x, s.y);
  }
  await expect(page.locator('.msg', { hasText: 'aynayla iki halka' })).toBeVisible();
  const sides = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const m = (window as any).app.store.get().parts[0].mesh;
    let left = 0;
    let right = 0;
    for (let t = 0; t < m.labels.length; t++) {
      if (m.labels[t] !== 3) continue;
      const x = m.positions[3 * m.indices[3 * t]];
      if (x < 0) left++;
      else right++;
    }
    return { left, right };
  });
  expect(sides.left).toBeGreaterThan(20);
  expect(Math.abs(sides.left - sides.right) / sides.right).toBeLessThan(0.3);

  // tolerans deneme parçası: plaka + 3 pim
  await page.getByRole('button', { name: 'Deneme parçası üret' }).click();
  await expect(page.locator('ul.parts li')).toHaveCount(5, { timeout: 30_000 });

  // ayrık görünüm: parçalar merkezden uzaklaşır
  await page.keyboard.press('x');
  const moved = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    return [...vp.parts.values()].some((p: any) => p.mesh.position.length() > 1);
  });
  expect(moved).toBe(true);
  expect(errors).toEqual([]);
});
