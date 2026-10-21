import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
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

test('X78: Tapa ve Yapıştır önizlemesi Space olmadan açılır', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  // fırçayla yalnız burun (Akıllı seç bu figürde bütün başı alıyor)
  await page.locator('.ribbon button').nth(1).click();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect
    .poll(async () => (await state(page)).preview?.volumes?.length ?? 0, { timeout: 30_000 })
    .toBeGreaterThan(0);
  expect((await state(page)).cut.mode).toBe('socket');
  await page.screenshot({ path: 'test-results/live-preview-socket.png' });

  // Space kapatır; sonraki boya yeniden açar
  await page.keyboard.press('Space');
  expect((await state(page)).previewActive).toBe(false);
  await page.getByRole('button', { name: 'Yapıştır', exact: true }).click();
  await expect.poll(async () => (await state(page)).previewActive).toBe(true);
  await expect
    .poll(async () => (await state(page)).preview !== null, { timeout: 30_000 })
    .toBe(true);
  expect(errors).toEqual([]);
});

const BLUEY = `${homedir()}/Downloads/Bluey_Color.3mf`;

test('X78: önizlemesi uzun süren modelde canlı önizleme kapanır', async ({ page }) => {
  test.skip(!existsSync(BLUEY), 'model yok');
  // paralel takımda Bluey önizlemesi 120 s worker sınırına takılıyor: tek başına çalışır
  test.skip(!process.env.HEAVY, 'HEAVY=1 ile tek başına çalıştırın');
  test.setTimeout(420_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(BLUEY);
  await expect.poll(async () => (await state(page)).parts.length, { timeout: 120_000 }).toBe(1);
  await expect.poll(async () => (await state(page)).busy, { timeout: 120_000 }).toBeNull();
  // Tapa elle seçilir (öneri modu değiştirmesin); renk 1 (büyük beyaz bölge) seçili
  await page.locator('ul.slots li').nth(1).locator('.key').click();
  await page.getByRole('button', { name: 'Tapa', exact: true }).click();
  // ilk canlı önizleme 1,5 s'yi geçer: sonucu görünür, parça yavaş sayılır.
  // Sırada bekleyen önizleme kalmasın: sonuç gelene kadar beklenir
  await expect
    .poll(
      async () => {
        const s = await state(page);
        return s.slowPreview.length === 1 && s.preview !== null;
      },
      // paralel takımda büyük bölgenin önizlemesi dakikalar sürebiliyor
      { timeout: 300_000 },
    )
    .toBe(true);
  // sonraki değişiklikte önizleme kapanır, yazı görünür, kendiliğinden açılmaz
  await page.locator('ul.slots li').nth(4).locator('.key').click();
  await expect.poll(async () => (await state(page)).previewActive).toBe(false);
  await expect(page.locator('.slow-preview')).toContainText('önizleme için Space');
  await page.waitForTimeout(800);
  expect((await state(page)).previewActive).toBe(false);
  await page.screenshot({ path: 'test-results/live-preview-slow.png' });
  // Space ile yine açılır
  await page.keyboard.press('Space');
  expect((await state(page)).previewActive).toBe(true);
});
