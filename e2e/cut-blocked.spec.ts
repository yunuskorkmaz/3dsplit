import { expect, type Page, test } from '@playwright/test';

async function screenOf(page: Page, p: number[]): Promise<{ x: number; y: number }> {
  return page.evaluate((pt) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(pt[0], pt[1], pt[2]).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

const FULL = 'Bölge bütün gövdeyi kaplıyor; kesilecek sınır yok. Bir kısmını Silgi ile çıkar.';

test('X114: olmayacak kesimde Kes kapalı ve neden yazılı, küçük seçimde uyarı', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const kes = page.getByRole('button', { name: 'Kes', exact: true });

  // tek tık fırça, küçük uç: boyut uyarısı, Kes açık
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  await page.evaluate(() => (window as any).app.store.set({ brushRadius: 0.3 }));
  await page.keyboard.press('1');
  await page.keyboard.press('b');
  const belly = await screenOf(page, [0, -14.8, 30]);
  await page.mouse.click(belly.x, belly.y);
  const small = page.locator('.selection-note', {
    hasText: /^Seçim [\d,]+ mm; basılamayabilir\.$/,
  });
  await expect(small).toBeVisible();
  await expect(kes).toBeEnabled({ timeout: 30_000 });

  // kova ile bütün gövde: önizleme kesimin olmayacağını bulur
  await page.keyboard.press('g');
  const chest = await screenOf(page, [0, -14.2, 40]);
  await page.mouse.click(chest.x, chest.y);
  await expect(small).toHaveCount(0);
  const preview = page.getByRole('checkbox', { name: /Önizleme/ });
  if (!(await preview.isChecked())) await preview.check();
  await expect(page.locator('.selection-note', { hasText: FULL })).toBeVisible({ timeout: 30_000 });
  await expect(kes).toBeDisabled();
  await expect(page.locator('.msg', { hasText: FULL })).toHaveCount(1);

  // ayar değişince önizleme yeniden hesaplanır; aynı ileti ikinci kez çıkmaz
  await page.getByRole('button', { name: 'Hafif', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('.msg', { hasText: FULL })).toHaveCount(1);
  await expect(kes).toBeDisabled();
  await page.screenshot({ path: 'test-results/cut-blocked.png' });

  // önizleme kapalıyken boya değişince Kes yeniden açılır
  await preview.uncheck();
  await page.keyboard.press('e');
  await page.mouse.click(belly.x, belly.y);
  await expect(page.locator('.selection-note', { hasText: FULL })).toHaveCount(0);
  await expect(kes).toBeEnabled();
  expect(errors).toEqual([]);
});
