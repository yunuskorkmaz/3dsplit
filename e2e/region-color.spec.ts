import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, type Page, test } from '@playwright/test';
import { colorDistance, MIN_COLOR_DISTANCE } from '../src/state/slotColor';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

const BLUEY = `${homedir()}/Downloads/Bluey_Color.3mf`;

/** Kameraya bakan ve en yakın, `label` boyalı üçgenin ekran noktası. */
function paintedPoint(page: Page, label: number): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const w = window as any;
    const vp = w.viewport;
    const m = w.app.store.get().parts[0].mesh;
    const cam = vp.camera.position;
    const p = m.positions;
    const ix = m.indices;
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let t = 0; t < m.labels.length; t++) {
      if (m.labels[t] !== id) continue;
      const a = 3 * ix[3 * t];
      const b = 3 * ix[3 * t + 1];
      const c = 3 * ix[3 * t + 2];
      const cx = (p[a] + p[b] + p[c]) / 3;
      const cy = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
      const cz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
      const d = Math.hypot(cam.x - cx, cam.y - cy, cam.z - cz);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    const a = 3 * ix[3 * best];
    const b = 3 * ix[3 * best + 1];
    const c = 3 * ix[3 * best + 2];
    const v = cam
      .clone()
      .set(
        (p[a] + p[b] + p[c]) / 3,
        (p[a + 1] + p[b + 1] + p[c + 1]) / 3,
        (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
      )
      .project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, label);
}

const slotOf = async (page: Page, id: number) =>
  (await state(page)).slots.find((s: { id: number }) => s.id === id);

test('X111: yeni set modelde olmayan renk alır, ilk boya bölgenin rengini verir', async ({
  page,
}) => {
  test.skip(!existsSync(BLUEY), 'model yok');
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(BLUEY);
  await expect(page.locator('.msg', { hasText: 'Boyalı 3MF' })).toBeVisible({ timeout: 120_000 });

  // + Seçim seti: dosyadaki renklerin (turuncu dahil) hiçbirine yakın değil
  await page.getByRole('button', { name: '+ Seçim seti' }).click();
  const s = await state(page);
  const added = s.slots[s.slots.length - 1];
  expect(s.activeSlot).toBe(added.id);
  for (const other of s.slots.filter((x: { id: number }) => x.id !== added.id))
    expect(colorDistance(added.color, other.color)).toBeGreaterThan(MIN_COLOR_DISTANCE);

  // beyaz (Filament 1) bölgeye ilk tık: set beyaz olur
  const white = await paintedPoint(page, 1);
  await page.mouse.click(white.x, white.y);
  await expect
    .poll(async () => (await state(page)).parts[0].mesh.labels.includes(added.id))
    .toBe(true);
  expect((await slotOf(page, added.id)).color).toBe('#ffffff');
  await page.screenshot({ path: 'test-results/region-color.png' });
  expect(errors).toEqual([]);
});

test('X111: boyasız gri gövdede ve elle seçilen renkte set rengi değişmez', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  const nose = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const v = vp.camera.position.clone().set(0, -16.9, 62).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  });
  // taban grisi verilmez
  const before = (await slotOf(page, 1)).color;
  await page.keyboard.press('1');
  await page.mouse.click(nose.x, nose.y);
  await expect.poll(async () => (await state(page)).parts[0].mesh.labels.includes(1)).toBe(true);
  expect((await slotOf(page, 1)).color).toBe(before);

  // elle renk: Seçim 2'ye sarı verilip Seçim 1'in üstüne boyanınca sarı kalır
  await page.locator('ul.slots input[type=color]').nth(2).fill('#ffff00');
  await page.locator('ul.slots input[type=color]').nth(2).blur();
  expect(await slotOf(page, 2)).toMatchObject({ color: '#ffff00', customColor: true });
  await page.keyboard.press('2');
  await page.locator('.ribbon').getByRole('button', { name: 'Fırça', exact: true }).click();
  await page.mouse.click(nose.x, nose.y);
  await expect.poll(async () => (await state(page)).parts[0].mesh.labels.includes(2)).toBe(true);
  expect((await slotOf(page, 2)).color).toBe('#ffff00');

  // elle seçilmemiş Seçim 3, sarı Seçim 2'nin üstüne ilk boyada sarı olur
  await page.keyboard.press('3');
  await page.mouse.click(nose.x, nose.y);
  await expect.poll(async () => (await state(page)).parts[0].mesh.labels.includes(3)).toBe(true);
  expect((await slotOf(page, 3)).color).toBe('#ffff00');
});
