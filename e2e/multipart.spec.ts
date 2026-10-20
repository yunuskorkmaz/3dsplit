import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, type Page, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

const GROGU = `${homedir()}/Downloads/Grogu_Bambu_Colour.3mf`;

test('X80: iki dosya: adlar uzantısız, en büyük parça seçili', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['samples/testa.stl', 'samples/figure.stl']);
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator('ul.parts input.name').first()).toHaveValue('testa');
  await expect(page.locator('ul.parts input.name').nth(1)).toHaveValue('figure');
  // her dosya kendi en büyük parçasını seçer: son açılan figure
  expect((await state(page)).parts[1].id).toBe((await state(page)).selectedPartId);
});

test('X80: Grogu açılınca en büyük parça seçili, plaka uyarısı yok', async ({ page }) => {
  test.skip(!existsSync(GROGU), 'model yok');
  test.setTimeout(180_000);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(GROGU);
  await expect
    .poll(async () => (await state(page)).parts.length, { timeout: 120_000 })
    .toBeGreaterThan(5);
  await expect.poll(async () => (await state(page)).busy, { timeout: 120_000 }).toBeNull();
  const info = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    // hacim: işaretli tetrahedron toplamı
    const vol = (m: { positions: Float32Array; indices: Uint32Array }) => {
      let v = 0;
      const p = m.positions;
      const ix = m.indices;
      for (let t = 0; t < ix.length; t += 3) {
        const a = 3 * ix[t];
        const b = 3 * ix[t + 1];
        const c = 3 * ix[t + 2];
        v +=
          p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
          p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
          p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
      }
      return Math.abs(v / 6);
    };
    const vols = s.parts.map((p: { id: string; name: string; mesh: never }) => ({
      id: p.id,
      name: p.name,
      v: vol(p.mesh),
    }));
    const big = vols.reduce((a: { v: number }, b: { v: number }) => (b.v > a.v ? b : a));
    return { selected: s.selectedPartId, big: big.id, name: big.name };
  });
  expect(info.selected).toBe(info.big);
  await expect(page.locator('.print-size.warn')).toHaveCount(0);
  const names: string[] = (await state(page)).parts.map((p: { name: string }) => p.name);
  expect(names.filter((n) => /\.stl/i.test(n))).toEqual([]);
  // bütün parçalar ekranda: görünüm dosyanın tamamına sığdırıldı
  const outside = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    let n = 0;
    for (const { mesh } of vp.parts.values()) {
      mesh.geometry.computeBoundingBox();
      const c = mesh.geometry.boundingBox.getCenter(vp.camera.position.clone());
      mesh.localToWorld(c).project(vp.camera);
      if (Math.abs(c.x) > 1 || Math.abs(c.y) > 1) n++;
    }
    return n;
  });
  expect(outside).toBe(0);
  await page.screenshot({ path: 'test-results/multipart-grogu.png' });
});
