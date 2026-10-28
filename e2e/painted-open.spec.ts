import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, type Page, test } from '@playwright/test';

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

test('X104: boyalı 3MF açılınca hiçbir renk kesime hazır değil, tık rengi seçer', async ({
  page,
}) => {
  test.skip(!existsSync(BLUEY), 'model yok');
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(BLUEY);
  await expect(page.locator('.msg', { hasText: 'filament' })).toBeVisible({ timeout: 120_000 });
  await expect.poll(async () => (await state(page)).busy, { timeout: 120_000 }).toBeNull();

  const s = await state(page);
  expect(s.activeSlot).toBe(0);
  expect(s.tool).toBe('smart');
  // setler tek biçimde adlanır
  expect(
    s.slots.filter((x: { id: number }) => x.id > 0).map((x: { name: string }) => x.name),
  ).toEqual(['Filament 1', 'Filament 2', 'Filament 3', 'Filament 4', 'Filament 5']);
  const kes = page.locator('.cut-actions').getByRole('button', { name: 'Kes', exact: true });
  await expect(kes).toBeDisabled();
  await expect(page.locator('.step-bar [aria-current="step"]')).toHaveText('Seç');
  await expect(page.locator('.status-line')).toContainText('Ayıracağın renge tıkla');
  await page.screenshot({ path: 'test-results/painted-open.png' });

  // göz bebeğine (Filament 4) tık: boyamaz, o seti seçer
  const painted = (await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const l = (window as any).app.store.get().parts[0].mesh.labels as Uint16Array;
    return Array.from(l).filter((x) => x === 4).length;
  })) as number;
  const pupil = await paintedPoint(page, 4);
  await page.mouse.click(pupil.x, pupil.y);
  await expect.poll(async () => (await state(page)).activeSlot).toBe(4);
  const after = (await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const l = (window as any).app.store.get().parts[0].mesh.labels as Uint16Array;
    return Array.from(l).filter((x) => x === 4).length;
  })) as number;
  expect(after).toBe(painted);
  expect((await state(page)).undoStack.length).toBe(0);
  await expect(page.locator('.step-bar [aria-current="step"]')).toHaveText('Kes');
  await expect(kes).toBeEnabled({ timeout: 60_000 });
  await page.screenshot({ path: 'test-results/painted-open-picked.png' });
  expect(errors).toEqual([]);
});
