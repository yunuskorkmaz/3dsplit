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

test('X58: yüzen sahne ve seçimin yeri', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await expect(page.locator('.empty-stage')).toContainText('Modeli aç');
  await expect(page.locator('.ribbon')).toBeVisible();

  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.empty-stage')).toHaveCount(0);
  const shading = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.scene.children.find(
      (c: {
        isMesh?: boolean;
        geometry?: { attributes?: { color?: unknown; normal?: { array: Float32Array } } };
      }) => c.isMesh && c.geometry?.attributes?.color && c.geometry?.attributes?.normal,
    );
    const n = mesh.geometry.attributes.normal.array as Float32Array;
    let curved = false;
    for (let t = 0; t < n.length / 9; t++) {
      const dx = n[9 * t] - n[9 * t + 3];
      const dy = n[9 * t + 1] - n[9 * t + 4];
      const dz = n[9 * t + 2] - n[9 * t + 5];
      if (dx * dx + dy * dy + dz * dz > 1e-4) {
        curved = true;
        break;
      }
    }
    return { flat: mesh.material.flatShading as boolean, curved };
  });
  expect(shading.flat).toBe(false);
  expect(shading.curved).toBe(true);
  await expect(page.getByText('Derinlik')).toBeVisible();

  await page.locator('.ribbon').getByRole('button', { name: 'Pimli kes', exact: true }).click();
  await expect(page.getByText('Elle yerleştir')).toBeVisible();
  await expect(page.getByText('Derinlik')).toHaveCount(0);

  await page.locator('.ribbon').getByRole('button', { name: 'Tapa', exact: true }).click();
  await expect(page.getByText('Derinlik')).toBeVisible();

  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect(page.locator('ul.slots li').nth(1)).toHaveClass(/selected/);
  const marked = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.scene.children.find(
      (o: {
        userData?: { partId?: string };
        traverse?: (fn: (c: { type: string }) => void) => void;
      }) => o.userData?.partId,
    );
    let sprite = false;
    mesh.traverse((o: { type: string }) => {
      if (o.type === 'Sprite') sprite = true;
    });
    return sprite;
  });
  expect(marked).toBe(true);
  await page.screenshot({ path: 'test-results/chrome-kabuk.png' });
  expect(errors).toEqual([]);
});

test('X66: meşgulken İptal görünür', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (window as any).app.store.set({ busy: 'Kesiliyor…' });
  });
  const cancel = page.getByRole('button', { name: 'İptal' });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (window as any).app.store.set({ busy: null });
  });
  await expect(cancel).toHaveCount(0);
});
