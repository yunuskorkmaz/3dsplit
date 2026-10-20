import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * X76: at başı Pimli kes ile tek parça + gövde olmalı, pin dışarı taşımamalı.
 * Model depoda yok: HORSE_STL=~/Downloads/_75_caballo_key-fins.stl ile çalışır.
 * docs/catpin-flow.md'deki hatalar giderilene kadar bilerek başarısız olur.
 */
const horse = process.env.HORSE_STL ?? '';

test.skip(!horse || !existsSync(horse), 'HORSE_STL verilmedi');

test('at başı: boya → pin kendiliğinden → kes → 2 parça', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(horse);
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('kanvas yok');

  // Başın ortası; önden varsayılan görünüşte.
  await page.keyboard.press('1');
  await page.keyboard.press('f');
  await page.mouse.click(box.x + box.width * 0.629, box.y + box.height * 0.716);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/horse-keys-painted.png' });

  // X72: baş kalın bölge, öneri Pimli kes.
  await expect(page.locator('.suggestion')).toContainText('Pimli kes');

  await page.getByRole('button', { name: 'Pimli kes', exact: true }).click();
  // X74: Space'e basmadan pin önizlemesi gelir.
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/horse-keys-preview.png' });
  const pins = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    return s.preview?.pins?.length ?? 0;
  });
  expect(pins).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: 'Kesildi' })).toBeVisible({ timeout: 120_000 });
  await page.keyboard.press('x');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/horse-keys-cut.png' });

  // X73: hiçbir pin dışarı taşımaz.
  await expect(page.locator('.msg', { hasText: 'modelin dışına taşıyor' })).toHaveCount(0);
  // X75: kaynak + baş + gövde.
  await expect(page.locator('ul.parts li')).toHaveCount(3);
  expect(errors).toEqual([]);
});
