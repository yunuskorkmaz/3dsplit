import { expect, type Page, test } from '@playwright/test';

/** Tablanın durumu: görünür mü, sığıyor mu, yüksekliği ve modelin en alt noktası. */
const bed = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const b = vp.scene.getObjectByName('bed');
    let minZ = Infinity;
    for (const { mesh } of vp.parts.values()) {
      mesh.geometry.computeBoundingBox();
      minZ = Math.min(minZ, mesh.geometry.boundingBox.min.z + mesh.position.z);
    }
    return { visible: b.visible, fits: b.userData.fits, z: b.position.z, minZ };
  });

test('X82: tabla modelin altında, sığmayınca sarı, kapatılabilir', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const b0 = await bed(page);
  expect(b0.visible).toBe(true);
  expect(b0.fits).toBe(true);
  expect(Math.abs(b0.z - b0.minZ)).toBeLessThan(0.5);
  await page.screenshot({ path: 'test-results/bed.png' });

  // tabla tıklamayı yakalamaz: modelin dışında ama tablanın üstünde boşluk
  const r = await page.locator('canvas').first().boundingBox();
  const empty = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (pt) => (window as any).viewport.pick({ clientX: pt.x, clientY: pt.y }),
    { x: (r?.x ?? 0) + 320, y: (r?.y ?? 0) + (r?.height ?? 0) - 100 },
  );
  expect(empty).toBeNull();

  // 400 mm'ye ölçekle: sığmaz
  await page.locator('.print-size-pop summary').click();
  const size = page.locator('.print-size-pop input').first();
  await size.fill('400');
  await page.getByRole('button', { name: 'Ölçekle' }).click();
  await expect.poll(async () => (await bed(page)).fits).toBe(false);
  await page.screenshot({ path: 'test-results/bed-large.png' });

  // Kamera panelinde kapat; yenileyince hatırlanır
  await page.getByRole('heading', { name: 'Kamera' }).click();
  await page.getByLabel('Tabla').uncheck();
  expect((await bed(page)).visible).toBe(false);
  await page.reload();
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  expect((await bed(page)).visible).toBe(false);
});
