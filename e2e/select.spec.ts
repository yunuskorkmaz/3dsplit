import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

/** Parçanın sınır kutusu ortasının ekran noktası (aralıklı görünümün kaydırması dahil). */
async function centerOf(page: Page, partId: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.parts.get(id).mesh;
    mesh.geometry.computeBoundingBox();
    const c = mesh.geometry.boundingBox.getCenter(vp.camera.position.clone());
    mesh.localToWorld(c);
    const v = c.project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, partId);
}

test('X79: seçili olmayan parçaya ilk tık yalnız seçer, ikinci tık boyar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['samples/figure.stl', 'samples/testa.stl']);
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 60_000 });
  await expect.poll(async () => (await state(page)).busy, { timeout: 60_000 }).toBeNull();
  await page.getByRole('button', { name: 'Aralıklı' }).click();
  await page.waitForTimeout(300);

  const s0 = await state(page);
  const other = s0.parts.find((p: { id: string }) => p.id !== s0.selectedPartId).id;
  const at = await centerOf(page, other);
  // ekranda o noktada gerçekten diğer parça var
  const hitId = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (pt) => (window as any).viewport.pick({ clientX: pt.x, clientY: pt.y })?.partId,
    at,
  );
  expect(hitId).toBe(other);

  await page.mouse.click(at.x, at.y);
  const s1 = await state(page);
  expect(s1.selectedPartId).toBe(other);
  expect(s1.paintVersion).toBe(s0.paintVersion);
  // listede seçili satır turuncu kenarlı, görünümde dış çizgi o parçada
  const row = page.locator('ul.parts li.selected');
  await expect(row).toHaveCount(1);
  expect(await row.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('255, 153, 0');
  // dış çizgi bir sonraki karede güncellenir
  await expect
    .poll(() =>
      page.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
        () => (window as any).viewport.selectOutline.selectedObjects[0]?.userData.partId,
      ),
    )
    .toBe(other);
  await page.screenshot({ path: 'test-results/select-outline.png' });

  // fare üstündeki (seçili olmayan) parça ince çizgi alır
  const first = await centerOf(page, s0.selectedPartId);
  await page.mouse.move(first.x, first.y);
  await expect
    .poll(() =>
      page.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
        () => (window as any).viewport.hoverOutline.selectedObjects[0]?.userData.partId,
      ),
    )
    .toBe(s0.selectedPartId);
  await page.screenshot({ path: 'test-results/select-hover.png' });

  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await state(page)).paintVersion).toBeGreaterThan(s0.paintVersion);
  expect(errors).toEqual([]);
});
