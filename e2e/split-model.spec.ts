import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const GROGU = `${homedir()}/Downloads/Grogu_Bambu_Colour.3mf`;
const NOTE =
  /^\d+ gövde ayrı parça olarak geldi; renkler zaten ayrı\. Kesmeden dışa aktarabilirsin/;

/** İki ayrı kutudan oluşan boyasız 3MF. */
function twoBoxes(): Buffer {
  const box = (id: number, x: number) => {
    const v = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [0, 0, 10],
      [10, 0, 10],
      [10, 10, 10],
      [0, 10, 10],
    ]
      .map(([a, b, c]) => `<vertex x="${a + x}" y="${b}" z="${c}"/>`)
      .join('');
    const t = [
      [0, 2, 1],
      [0, 3, 2],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ]
      .map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`)
      .join('');
    return `<object id="${id}" name="kutu ${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`;
  };
  const model = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>${box(1, 0)}${box(2, 20)}</resources>
 <build><item objectid="1"/><item objectid="2"/></build>
</model>`;
  return Buffer.from(zipSync({ '3D/3dmodel.model': strToU8(model) }));
}

test('X124: boyasız çok gövdeli dosyada kesmeden aktarılabilir denir, Aktar etkin', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'kutular.3mf', mimeType: 'model/3mf', buffer: twoBoxes() });
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('.msg', { hasText: NOTE })).toContainText('2 gövde ayrı parça');
  const exportStep = page.locator('.step-bar li', { hasText: 'Aktar' });
  await expect(exportStep).toHaveClass(/ready/);
  await page.screenshot({ path: 'test-results/split-model.png' });
});

test('X124: tek gövdeli boyasız modelde ileti yok', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(300);
  await expect(page.locator('.msg', { hasText: NOTE })).toHaveCount(0);
  await expect(page.locator('.step-bar li', { hasText: 'Aktar' })).not.toHaveClass(/ready/);
});

test('X124: Grogu', async ({ page }) => {
  test.skip(!existsSync(GROGU), 'model yok');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(GROGU);
  await expect(page.locator('ul.parts li')).toHaveCount(12, { timeout: 180_000 });
  await expect(page.locator('.msg', { hasText: NOTE })).toContainText('12 gövde ayrı parça');
  await expect(page.locator('.step-bar li', { hasText: 'Aktar' })).toHaveClass(/ready/);
});
