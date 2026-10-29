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

/** Öğenin ortasındaki en üst öğe kendisi (ya da içindeki) mi: başka öğenin altında değil. */
const onTop = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, selector);

test('X118: odak görünür kalır, Yardım odağı tutar, kesimden sonra odak satırda', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press('1');
  await page.keyboard.press('b');
  const nose = await screenOf(page, [0, -16.9, 62]);
  await page.mouse.click(nose.x, nose.y);

  // Tab ile gelinen tolerans düğmesi yapışkan Kes alanının altında kalmaz
  const panel = page.locator('.tool-window');
  await panel.evaluate((el) => {
    el.scrollTop = 0;
  });
  await panel.getByRole('button', { name: 'Sıkı 0,1' }).focus();
  await page.keyboard.press('Tab');
  const normal = panel.getByRole('button', { name: 'Normal 0,2' });
  await expect(normal).toBeFocused();
  await normal.evaluate((el) => el.setAttribute('data-probe', '1'));
  expect(await onTop(page, '[data-probe="1"]')).toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focusedOnTop = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
  expect(focusedOnTop).toBe(true);

  // Yardım: odak içeri girer, Tab içeride döner, Esc açan öğeye döndürür
  await page.locator('body').focus();
  await page.keyboard.press('?');
  const modal = page.getByRole('dialog', { name: 'Yardım' });
  await expect(modal).toBeVisible();
  await expect.poll(() => modal.evaluate((m) => m.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await modal.evaluate((m) => m.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // panel başlığı düğme
  await expect(page.locator('.panel-toggle').first()).toHaveAttribute(
    'aria-expanded',
    /true|false/,
  );

  // Kes'e Enter: kesimden sonra odak kesilen parçanın satırında
  const kes = page.getByRole('button', { name: 'Kes', exact: true });
  await kes.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toBeVisible({ timeout: 60_000 });
  const focused = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    const id = (document.activeElement as HTMLElement).dataset.part;
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    return s.parts.find((p: any) => p.id === id)?.name ?? null;
  });
  expect(focused).toBe('Gövde 1');

  // ileti klavyeyle kapanır; bildirim alanı ekran okuyucuya açık
  await expect(page.locator('.status')).toHaveAttribute('aria-live', 'polite');
  const msg = page.locator('.msg', { hasText: /Kes \d+: / });
  await msg.getByRole('button', { name: 'İletiyi kapat' }).focus();
  await page.keyboard.press('Enter');
  await expect(msg).toHaveCount(0);
  expect(errors).toEqual([]);
});
