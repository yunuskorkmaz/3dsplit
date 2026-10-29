import { expect, type Page, test } from '@playwright/test';

const look = (page: Page) =>
  page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const c = vp.camera.position;
    const t = vp.controls.target;
    return { x: c.x - t.x, y: c.y - t.y, z: c.z - t.z };
  });

/** Küpteki düğmenin üstte kalan bir noktasına tıklar. */
async function press(page: Page, name: string) {
  const button = page.locator('.viewcube').getByRole('button', { name, exact: true });
  const point = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let iy = 1; iy < 6; iy++)
      for (let ix = 1; ix < 6; ix++) {
        const x = r.left + (r.width * ix) / 6;
        const y = r.top + (r.height * iy) / 6;
        if (document.elementFromPoint(x, y) === el) return { x, y };
      }
    return null;
  });
  if (!point) throw new Error(`${name} tıklanamıyor`);
  await page.mouse.click(point.x, point.y);
  // küpün dönüş geçişi bitsin
  await page.waitForTimeout(100);
  await page.waitForFunction(() => document.querySelector('.cube')?.getAnimations().length === 0);
}

/** Etkin küp düğmelerinden üstte kalan noktası olmayanlar. */
const buried = (page: Page) =>
  page.locator('.viewcube button').evaluateAll((els) =>
    els
      .filter((el) => !el.closest('[inert]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        for (let iy = 1; iy < 6; iy++)
          for (let ix = 1; ix < 6; ix++)
            if (
              document.elementFromPoint(
                r.left + (r.width * ix) / 6,
                r.top + (r.height * iy) / 6,
              ) === el
            )
              return false;
        return true;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return `${el.textContent || el.getAttribute('aria-label')}<${h?.textContent || h?.getAttribute('aria-label') || h?.className}>${Math.round(r.width)}x${Math.round(r.height)}`;
      }),
  );

test('X120: bakılan yüze tekrar tık karşı yüze çevirir, arkadaki düğmeler kapalı', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  // açılış görünüşü zaten Ön; köşeden başla
  await press(page, 'Ön sağ üst');
  await press(page, 'Ön');
  expect((await look(page)).y).toBeLessThan(0);
  await expect(page.locator('.viewcube .face', { hasText: 'Ön' })).toHaveAttribute(
    'title',
    'Ön · tekrar tıkla: Arka',
  );
  expect(await buried(page)).toEqual([]);
  // arkada kalan yüz odak almaz, tıklanmaz
  await expect(page.locator('.viewcube .face', { hasText: 'Arka' })).toHaveAttribute('inert', '');

  await press(page, 'Ön');
  const back = await look(page);
  expect(back.y).toBeGreaterThan(0);
  expect(Math.abs(back.x)).toBeLessThan(back.y * 0.5);
  expect(await buried(page)).toEqual([]);
  await expect(page.locator('.viewcube .face', { hasText: 'Ön' })).toHaveAttribute('inert', '');

  await press(page, 'Arka');
  expect((await look(page)).y).toBeLessThan(0);

  await press(page, 'Üst');
  expect((await look(page)).z).toBeGreaterThan(0);
  await press(page, 'Üst');
  expect((await look(page)).z).toBeLessThan(0);
  expect(await buried(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/cube-alt.png' });
  expect(errors).toEqual([]);
});
