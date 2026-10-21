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

const painted = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const part = s.parts.find((p: any) => p.id === s.selectedPartId);
    return part.mesh.labels.filter((l: number) => l === 1).length as number;
  });

test('X86: araç penceresi: ayarlar, seçim satırı, Önizleme kutusu, İptal / Kes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const win = page.locator('.tool-window');
  // Akıllı seç ayarları pencerede
  await expect(win.locator('.panel-head', { hasText: 'Akıllı seç' })).toBeVisible();
  await expect(win.getByText('Yalnız çukur')).toBeVisible();
  await expect(page.locator('.top-stack')).toHaveCount(0);
  await expect(win.locator('.selection-row.empty')).toBeVisible();

  // fırçayla burun: seçim satırı
  await page.keyboard.press('1');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  await expect(win.locator('.panel-head', { hasText: 'Fırça' })).toBeVisible();
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);
  const row = win.locator('.selection-row:not(.empty)');
  await expect(row).toContainText('Renk 1');
  await expect(row).toContainText('figure');
  const n = await painted(page);
  expect(n).toBeGreaterThan(0);

  // canlı önizleme kutuyu işaretler
  const preview = win.getByRole('checkbox', { name: 'Önizleme' });
  await expect(preview).toBeChecked({ timeout: 30_000 });

  // İptal: önizleme kapanır, Akıllı seç, boya kalır
  await win.getByRole('button', { name: 'İptal' }).click();
  await expect(preview).not.toBeChecked();
  expect((await state(page)).tool).toBe('smart');
  expect(await painted(page)).toBe(n);

  // × boyayı siler, Ctrl+Z geri getirir
  await row.getByRole('button', { name: 'Seçimi temizle' }).click();
  await expect(win.locator('.selection-row.empty')).toBeVisible();
  expect(await painted(page)).toBe(0);
  await page.keyboard.press('Control+z');
  await expect(row).toBeVisible();
  expect(await painted(page)).toBe(n);

  // kutu Space gibi açar
  await preview.check();
  await expect.poll(async () => (await state(page)).previewActive).toBe(true);
  await page.screenshot({ path: 'test-results/tool-window.png' });
  expect(errors).toEqual([]);
});
