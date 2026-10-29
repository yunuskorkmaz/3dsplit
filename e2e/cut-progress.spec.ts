import { existsSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const BLUEY = '/Users/yunuskorkmaz/Downloads/Bluey_Color.3mf';

async function screenOf(page: Page, p: number[]): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

/** Meşgul kartının aşama satırına yazılan her metni kaydeder. */
async function recordStages(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const w = window as any;
    w.stageTexts = [];
    new MutationObserver(() => {
      const el = document.querySelector('.msg.busy .busy-stage');
      const t = el?.textContent;
      if (t && !w.stageTexts.includes(t)) w.stageTexts.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  return () => page.evaluate(() => (window as any).stageTexts as string[]);
}

test('X127: kesimde meşgul kartı aşamayı sırayla yazar, hız saklanır', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  await expect(page.locator('.depth-tag')).toBeVisible({ timeout: 30_000 });

  const texts = await recordStages(page);
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /^Kes 1: / })).toBeVisible({ timeout: 60_000 });
  const seen = await texts();
  expect(seen.length).toBeGreaterThan(0);
  for (const t of seen) expect(t).toMatch(/^Aşama \d\/4 · .+…$/);
  expect(seen).toContain('Aşama 4/4 · Tapa ve yuva hacmi kuruluyor…');
  // sonraki tahmin için bu kesimin hızı saklandı
  const speeds = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('3dsplit.cutSpeed') ?? '{}'),
  );
  expect(speeds.socket?.length).toBe(1);
  expect(speeds.socket[0]).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('X127: Bluey kesiminde Aşama n/m', async ({ page }) => {
  test.skip(!existsSync(BLUEY), 'Bluey_Color.3mf indirilenlerde yok');
  test.setTimeout(600_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(BLUEY);
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 180_000 });
  await page.locator('ul.slots li').nth(5).locator('.key').click();
  await page.locator('.ribbon').getByRole('button', { name: 'Tapa', exact: true }).click();
  // geçmiş: 10 bin üçgen/s; 5 s geçince kalan süre yazılır
  await page.evaluate(() => localStorage.setItem('3dsplit.cutSpeed', '{"socket":[10000]}'));
  const texts = await recordStages(page);
  await page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg.busy .busy-time')).toHaveText(/^\d+ sn · ~\d+ sn kaldı$/, {
    timeout: 60_000,
  });
  await expect(page.locator('.msg.busy .busy-stage')).toHaveText(/^Aşama \d\/\d · /, {
    timeout: 120_000,
  });
  await expect(page.locator('.msg.busy [role=progressbar]')).toBeVisible();
  await page.screenshot({ path: 'test-results/cut-progress-bluey.png' });
  await expect(page.locator('.msg', { hasText: /^Kes 1: / })).toBeVisible({ timeout: 480_000 });
  expect((await texts()).length).toBeGreaterThan(1);
});
