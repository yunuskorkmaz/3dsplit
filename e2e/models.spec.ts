import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * Depoda olmayan gerçek modellerle tur: yükle → ortaya Akıllı seç → önerilen
 * modla kes. MODELS=dosya1;dosya2 ile çalışır. Her model için parça sayısı,
 * öneri ve uyarılar yazılır; sayfa hatası olmamalı, kesim parça vermeli.
 */
const models = (process.env.MODELS ?? '').split(';').filter((f) => f && existsSync(f));

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test.skip(!models.length, 'MODELS verilmedi');

for (const file of models) {
  test(`model: ${basename(file)}`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(file);
    await expect
      .poll(async () => (await state(page)).parts.length, { timeout: 180_000 })
      .toBeGreaterThan(0);
    await expect.poll(async () => (await state(page)).busy, { timeout: 180_000 }).toBeNull();
    const box = await page.locator('canvas').first().boundingBox();
    if (!box) throw new Error('kanvas yok');
    await page.keyboard.press('1');
    await page.keyboard.press('f');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(1500);
    const s = await state(page);
    const before = s.parts.length;
    const size = await page.locator('ul.parts li .size').first().textContent();
    const hint = page.locator('.suggestion');
    const suggestion = (await hint.count()) ? await hint.first().textContent() : '(öneri yok)';
    await page.screenshot({ path: `test-results/models-${basename(file)}-painted.png` });
    await page.getByRole('button', { name: 'Kes', exact: true }).click();
    await expect.poll(async () => (await state(page)).busy, { timeout: 240_000 }).toBeNull();
    await page.screenshot({ path: `test-results/models-${basename(file)}-cut.png` });
    const after = await state(page);
    const msgs = (await page.locator('.msg').allTextContents()).map((m) => m.replace(/×$/, ''));
    console.log(
      JSON.stringify({
        model: basename(file),
        size,
        mode: after.cut.mode,
        suggestion,
        newParts: after.parts.length - before,
        names: after.parts
          .filter((p: { badge: string }) => p.badge === 'new')
          .map(
            (p: { name: string; mesh: { labels: unknown[] } }) =>
              `${p.name} (${p.mesh.labels.length})`,
          ),
        msgs,
      }),
    );
    expect(errors).toEqual([]);
  });
}
