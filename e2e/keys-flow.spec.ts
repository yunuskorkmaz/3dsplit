import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, type Page, test } from '@playwright/test';

/**
 * X76: boya → mod Pimli kes → pin kendiliğinden (Space yok) → pini taşı/sil →
 * kes → 2 parça, pin taşmaz. Modeller depoda yok; bulunanlar çalışır.
 * `target`: tıklanacak dünya noktası ya da parçanın en uç köşesi (kulak ucu).
 */
const MODELS: { file: string; target: [number, number, number] | 'maxX' | 'minX' }[] = [
  { file: 'samples/testa.stl', target: [56, 62, 82] },
  { file: `${homedir()}/Downloads/YODA.3mf`, target: 'maxX' },
];

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

for (const { file, target } of MODELS) {
  test(`Pimli kes akışı: ${file.split('/').pop()}`, async ({ page }) => {
    test.skip(!existsSync(file), 'model yok');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(file);
    await expect
      .poll(async () => (await state(page)).parts.length, { timeout: 120_000 })
      .toBeGreaterThan(0);
    await expect.poll(async () => (await state(page)).busy, { timeout: 120_000 }).toBeNull();
    // çok parçalı dosyada en büyük parça (son yüklenen seçili kalıyor)
    await page.evaluate(() => {
      type Part = { id: string; mesh: { labels: ArrayLike<number> } };
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      const app = (window as any).app;
      const parts: Part[] = app.store.get().parts;
      const big = parts.reduce((a, b) => (b.mesh.labels.length > a.mesh.labels.length ? b : a));
      app.actions.selectPart(big.id);
    });
    await page.keyboard.press('1');

    // hedef nokta: verilen ya da seçili parçanın x'te en uç köşesi; kamera o yana döner
    const point: number[] = await page.evaluate((t) => {
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      const w = window as any;
      const s = w.app.store.get();
      const part = s.parts.find((p: { id: string }) => p.id === s.selectedPartId);
      const pos: Float32Array = part.mesh.positions;
      let best = [0, 0, 0];
      if (Array.isArray(t)) best = t;
      else {
        let ext = t === 'maxX' ? -Infinity : Infinity;
        for (let i = 0; i < pos.length; i += 3)
          if (t === 'maxX' ? pos[i] > ext : pos[i] < ext) {
            ext = pos[i];
            best = [pos[i], pos[i + 1], pos[i + 2]];
          }
      }
      let c = [0, 0, 0];
      for (let i = 0; i < pos.length; i += 3)
        c = [c[0] + pos[i], c[1] + pos[i + 1], c[2] + pos[i + 2]];
      const n = pos.length / 3;
      c = c.map((x) => x / n);
      const dir = w.viewport.camera.position
        .clone()
        .set(best[0] - c[0], best[1] - c[1], best[2] - c[2]);
      w.viewport.viewToward(dir.normalize());
      // uç köşeden biraz içeri: kulağın üstüne düşsün
      return best.map((x: number, k: number) => x - (best[k] - c[k]) * 0.04);
    }, target);
    await page.waitForTimeout(500);
    const at = await screenOf(page, point);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(600);
    const slug = file.split('/').pop();
    await page.screenshot({ path: `test-results/keys-flow-${slug}-painted.png` });

    // X72: öneri Pimli kes, mod kendiliğinden geçer
    await expect(page.locator('.suggestion')).toContainText('Pimli kes', { timeout: 20_000 });
    await expect.poll(async () => (await state(page)).cut.mode).toBe('keys');
    // X74: Space'e basmadan önizleme ve pin
    await expect
      .poll(async () => (await state(page)).preview?.pins?.length ?? 0, { timeout: 60_000 })
      .toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/keys-flow-${slug}-preview.png` });
    expect(
      (await state(page)).preview.warnings.filter((w: string) => w.includes('taşıyor')),
    ).toEqual([]);

    // X74: Akıllı seç aracındayken pin tutulup sürüklenir
    const before = await state(page);
    const pinAt = before.pinLayout[0].surface;
    const p0 = await screenOf(page, pinAt);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p0.x + 6, p0.y + 4, { steps: 4 });
    await page.mouse.up();
    const moved = await state(page);
    expect(moved.tool).toBe('smart');
    expect(moved.pins.length).toBe(before.pinLayout.length);
    expect(moved.selectedPin).toBe(0);
    // boya değişmedi: sürükleme boyamadı
    expect(moved.paintVersion).toBe(before.paintVersion);

    // Delete seçili pini siler (birden çok pin varsa)
    if (moved.pins.length > 1) {
      await page.keyboard.press('Delete');
      expect((await state(page)).pins.length).toBe(moved.pins.length - 1);
    }

    // elle taşınan pin kullanıcının; kesim otomatik yerleşimle yapılır
    await page.getByRole('button', { name: 'Otomatiğe dön', exact: true }).click();
    expect((await state(page)).pins.length).toBe(0);
    await page.getByRole('button', { name: 'Kes', exact: true }).click();
    await expect(page.locator('.msg', { hasText: /Kes \d+: / })).toBeVisible({ timeout: 180_000 });
    await page.screenshot({ path: `test-results/keys-flow-${slug}-cut.png` });
    await expect(page.locator('.msg', { hasText: 'taşıyor' })).toHaveCount(0);
    const after = await state(page);
    expect(after.parts.filter((p: { badge: string }) => p.badge === 'new').length).toBe(2);
    expect(errors).toEqual([]);
  });
}
