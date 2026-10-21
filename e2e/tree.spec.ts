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

test('X85: Model ağacı: gövde altında boyalı renkler, Renkler ve Kaynaklar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.panel-count')).toHaveText('1 gövde');
  await expect(page.locator('.color-row')).toHaveCount(0);

  // fırçayla burun: figure altında "Renk 1"
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  const row = page.locator('ul.parts li .color-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.cname')).toHaveText('Renk 1');
  expect(Number((await row.locator('.tris').textContent())?.replace(/\./g, ''))).toBeGreaterThan(0);

  // renk satırına tık aktif rengi değiştirir
  await page.keyboard.press('2');
  expect((await state(page)).activeSlot).toBe(2);
  await row.click();
  expect((await state(page)).activeSlot).toBe(1);
  await expect(row).toHaveClass(/active/);

  // Renkler'de göz boyayı yalnız görüntüde gizler
  const slot1 = page.locator('ul.slots li').nth(1);
  await slot1.locator('button.eye').click();
  expect((await state(page)).hiddenSlots).toEqual([1]);
  await slot1.locator('button.eye').click();
  expect((await state(page)).hiddenSlots).toEqual([]);

  // parça sağ tık menüsü tıklanan yerde açılır
  const part = page.locator('ul.parts li').first();
  const box = await part.boundingBox();
  await part.click({ button: 'right', position: { x: 40, y: 8 } });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const mbox = await menu.boundingBox();
  expect(Math.abs((mbox?.x ?? 0) - ((box?.x ?? 0) + 40))).toBeLessThan(4);
  await page.getByRole('menuitem', { name: 'Sığdır' }).click();
  await expect(menu).toHaveCount(0);

  // kesimden sonra eski parça Kaynaklar'da, klasör kapalı
  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: 'Kesildi' })).toBeVisible({ timeout: 60_000 });
  const sources = page.locator('.tree-folder', { hasText: 'Kaynaklar' });
  await expect(sources.locator('.count')).toHaveText('1');
  await expect(sources.locator('ul.parts.sources li')).toBeHidden();
  await expect(page.locator('.panel-count')).toHaveText('2 gövde');
  await sources.locator('.folder-toggle').click();
  await expect(sources.locator('ul.parts.sources li')).toBeVisible();
  await page.screenshot({ path: 'test-results/tree.png' });
  expect(errors).toEqual([]);
});
