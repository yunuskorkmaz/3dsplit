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

test('X97: meşgul kartı aşama gösterir, işlem adları sonucu söyler, kesimden sonra eski ipucu kalmaz', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  const bar = page.locator('.history-bar');
  await expect(
    bar.getByRole('button', { name: /Akıllı seç · Seçim 1 · [\d.]+ üçgen$/ }),
  ).toHaveCount(1);
  await expect(page.locator('.depth-tag')).toBeVisible({ timeout: 30_000 });

  // kesim sürerken kart: iş adı, aşama, süre
  const stages: string[] = [];
  await page.exposeFunction('__stage', (s: string) => stages.push(s));
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const w = window as any;
    w.app.store.useStore.subscribe(
      (s: { busyStage: string | null }, prev: { busyStage: string | null }) => {
        if (s.busyStage && s.busyStage !== prev.busyStage) w.__stage(s.busyStage);
      },
    );
  });
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg.busy')).toContainText('Kesiliyor · Tapa · Seçim 1 · figure');
  await expect(page.locator('.msg', { hasText: /Kes 1: Gövde 1 ayrıldı/ })).toBeVisible({
    timeout: 60_000,
  });
  expect(stages).toContain('Tapa ve yuva hacmi kuruluyor');
  expect(stages.at(-1)).toBeTruthy();

  // kesimden sonra seçim yok: derinlik kutusu, öneri ve önizleme hatası kalmaz
  await expect(page.locator('.depth-tag')).toHaveCount(0);
  await expect(page.locator('.suggestion')).toHaveCount(0);
  await expect(page.locator('.msg.error')).toHaveCount(0);
  expect((await state(page)).previewActive).toBe(false);
  await page.screenshot({ path: 'test-results/clarity.png' });
  expect(errors).toEqual([]);
});
