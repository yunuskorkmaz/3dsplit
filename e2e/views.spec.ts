import { expect, test } from '@playwright/test';

test('X54: küp arkaya, köşeye ve üste bakar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });

  const shot = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true });
    const point = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (let iy = 1; iy < 6; iy++) {
        for (let ix = 1; ix < 6; ix++) {
          const x = r.left + (r.width * ix) / 6;
          const y = r.top + (r.height * iy) / 6;
          if (document.elementFromPoint(x, y) === el) return { x, y };
        }
      }
      return null;
    });
    if (!point) throw new Error(`${name} tıklanamıyor`);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(320);
    return page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      const vp = (window as any).viewport;
      const c = vp.camera.position;
      const t = vp.controls.target;
      return { x: c.x - t.x, y: c.y - t.y, z: c.z - t.z };
    });
  };

  const front = await shot('Ön');
  expect(front.y).toBeLessThan(0);
  const top = await shot('Üst');
  expect(top.z).toBeGreaterThan(Math.abs(front.y) * 0.5);
  const frontCorner = await shot('Ön sağ üst');
  expect(frontCorner.x).toBeGreaterThan(0);
  expect(frontCorner.y).toBeLessThan(0);
  expect(frontCorner.z).toBeGreaterThan(0);
  const corner = await shot('Arka sağ üst');
  expect(corner.x).toBeGreaterThan(0);
  expect(corner.y).toBeGreaterThan(0);
  expect(corner.z).toBeGreaterThan(0);
  const back = await shot('Arka');
  expect(back.y).toBeGreaterThan(0);
  expect(Math.abs(back.x)).toBeLessThan(back.y * 0.5);
  await page.screenshot({ path: 'test-results/chrome-arka.png' });
  expect(errors).toEqual([]);
});
