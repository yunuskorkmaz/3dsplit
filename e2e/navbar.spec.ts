import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

/** Parçanın ekrandaki kutusunun ortası ve görünüm alanının ortası (paneller hariç). */
async function placement(page: Page, partId: string) {
  return page.evaluate((id) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.parts.get(id).mesh;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    const r = vp.renderer.domElement.getBoundingClientRect();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      const v = b.min.clone();
      if (k & 1) v.x = b.max.x;
      if (k & 2) v.y = b.max.y;
      if (k & 4) v.z = b.max.z;
      mesh.localToWorld(v).project(vp.camera);
      const x = ((v.x + 1) / 2) * r.width;
      const y = ((1 - v.y) / 2) * r.height;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return {
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      areaX: 310 + (r.width - 310 - 300) / 2,
      areaY: 16 + (r.height - 16 - 64) / 2,
    };
  }, partId);
}

const target = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const t = (window as any).viewport.controls.target;
    return [t.x, t.y, t.z] as number[];
  });

test('X87: gezinme çubuğu: kipler, sığdırma, kamera ayarı', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['samples/figure.stl', 'samples/testa.stl']);
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Kamera' })).toHaveCount(0);
  const nav = page.locator('.nav-bar');

  // Seçiliyi sığdır: seçili parça görünüm alanının ortasında
  const id = (await state(page)).selectedPartId as string;
  await nav.getByRole('button', { name: 'Seçiliyi sığdır' }).click();
  const p = await placement(page, id);
  expect(Math.abs(p.cx - p.areaX)).toBeLessThan(30);
  expect(Math.abs(p.cy - p.areaY)).toBeLessThan(30);

  // Kaydır kipi: modelin üstünde sol sürükleme boyamaz, kamerayı kaydırır
  await nav.getByRole('button', { name: 'Kaydır' }).click();
  expect((await state(page)).navMode).toBe('pan');
  const before = await target(page);
  const version = (await state(page)).paintVersion;
  await page.mouse.move(p.cx, p.cy + 130);
  await page.mouse.down();
  await page.mouse.move(p.cx + 120, p.cy + 130, { steps: 8 });
  await page.mouse.up();
  const after = await target(page);
  expect(
    Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]),
  ).toBeGreaterThan(1);
  expect((await state(page)).paintVersion).toBe(version);
  await page.keyboard.press('Escape');
  expect((await state(page)).navMode).toBeNull();
  // araç seçimi de kipi bitirir
  await nav.getByRole('button', { name: 'Döndür' }).click();
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  expect((await state(page)).navMode).toBeNull();

  // Görünüşler › Üst
  await nav.locator('summary[aria-label="Görünüşler"]').click();
  await nav.getByRole('button', { name: 'Üst', exact: true }).click();
  await expect(nav.locator('details[open]')).toHaveCount(0);

  // ⚙ › Blender, yenileyince hatırlanır
  await nav.locator('summary[aria-label="Kamera ayarları"]').click();
  await nav.getByRole('button', { name: 'Blender' }).click();
  expect((await state(page)).camera.mode).toBe('blender');
  await page.screenshot({ path: 'test-results/navbar.png' });
  await page.reload();
  expect((await state(page)).camera.mode).toBe('blender');
  expect(errors).toEqual([]);
});
