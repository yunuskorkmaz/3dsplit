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

async function colorAt(page: Page, p: [number, number, number]): Promise<[number, number, number]> {
  const scr = await screenOf(page, p);
  const rgb = await page.evaluate(({ x, y }) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const hit = vp.pick({ clientX: x, clientY: y });
    if (!hit) return null;
    const mesh = vp.scene.children.find(
      (o: { userData?: { partId?: string }; geometry?: object }) =>
        o.userData?.partId === hit.partId && o.geometry,
    );
    const arr = mesh.geometry.getAttribute('color').array as Uint8Array;
    const i = 9 * hit.tri;
    return [arr[i], arr[i + 1], arr[i + 2]];
  }, scr);
  expect(rgb, `${p.join(',')} noktasında üçgen bulunamadı`).not.toBeNull();
  return rgb as [number, number, number];
}

test('X77: renkler tam görünür, seçili renk öne çıkarılabilir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  const arm = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.scene.children.find(
      (o: { userData?: { partId?: string }; geometry?: { getAttribute(name: string): unknown } }) =>
        o.userData?.partId && o.geometry?.getAttribute('position'),
    );
    const pos = mesh.geometry.getAttribute('position');
    let best: [number, number, number] = [0, 0, 0];
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x > maxX) {
        maxX = x;
        best = [x, pos.getY(i), pos.getZ(i)];
      }
    }
    return best;
  });

  await page.locator('.toolbar button').nth(1).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await page.keyboard.press('2');
  const armScreen = await screenOf(page, arm);
  await page.mouse.click(armScreen.x, armScreen.y);

  // kol (slot 2) seçiliyken ve burun (slot 1) seçiliyken kolun rengi aynı
  const armActive = await colorAt(page, arm);
  await page.locator('ul.slots li').nth(1).locator('.key').click();
  const noseOn = await colorAt(page, [0, -16.9, 62]);
  const armOther = await colorAt(page, arm);
  expect(noseOn[0]).toBeGreaterThan(150);
  expect(armOther).toEqual(armActive);
  expect(armOther[2]).toBeGreaterThan(150);
  await page.screenshot({ path: 'test-results/chrome-slot.png' });

  // "Seçili rengi öne çıkar": diğer renkler solar, kapatınca geri gelir
  const dim = page.getByLabel('Seçili rengi öne çıkar');
  await dim.check();
  const armDim = await colorAt(page, arm);
  expect(armDim[1]).toBeLessThan(40);
  await dim.uncheck();
  expect(await colorAt(page, arm)).toEqual(armActive);

  await page.locator('ul.slots li').nth(0).locator('.key').click();
  const armFull = await colorAt(page, arm);
  expect(armFull[1]).toBeGreaterThan(60);
  expect(armFull[2]).toBeGreaterThan(150);

  await page.locator('ul.slots li').nth(2).getByRole('button', { name: 'temizle' }).click();
  await expect(page.locator('ul.slots input.name')).toHaveCount(4);
  await page.locator('ul.slots li').nth(2).getByRole('button', { name: 'kaldır' }).click();
  await expect(page.locator('ul.slots input.name')).toHaveCount(3);
  const armGone = await colorAt(page, arm);
  expect(Math.abs(armGone[0] - armGone[1])).toBeLessThan(20);
  expect(Math.abs(armGone[1] - armGone[2])).toBeLessThan(20);
  expect(errors).toEqual([]);
});
