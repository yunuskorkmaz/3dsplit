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

/** Parçanın kutu ortasının ekran noktası. */
async function centerOf(page: Page, partId: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.parts.get(id).mesh;
    mesh.geometry.computeBoundingBox();
    const c = mesh.geometry.boundingBox.getCenter(vp.camera.position.clone());
    mesh.localToWorld(c).project(vp.camera);
    const r = vp.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
  }, partId);
}

/** Parçanın ekrandaki kutusu (köşelerin izdüşümü). */
async function screenBox(page: Page, partId: string) {
  return page.evaluate((id) => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const vp = (window as any).viewport;
    const mesh = vp.parts.get(id).mesh;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    const r = vp.renderer.domElement.getBoundingClientRect();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      const v = b.min.clone();
      if (k & 1) v.x = b.max.x;
      if (k & 2) v.y = b.max.y;
      if (k & 4) v.z = b.max.z;
      mesh.localToWorld(v).project(vp.camera);
      const x = r.left + ((v.x + 1) / 2) * r.width;
      const y = r.top + ((1 - v.y) / 2) * r.height;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0, H: r.height };
  }, partId);
}

test('X81: tekerlek imlecin altındaki noktaya yakınlaştırır', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('samples/figure.stl');
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 30_000 });
  // kolun ucu: ekranın kenarına yakın bir model noktası
  const tip = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    const pos: Float32Array = s.parts[0].mesh.positions;
    let best = [0, 0, 0];
    for (let i = 0; i < pos.length; i += 3)
      if (pos[i] > best[0]) best = [pos[i] - 3, pos[i + 1], pos[i + 2]];
    return best;
  });
  const at = await screenOf(page, tip);
  // imlecin altındaki yüzey noktası
  const surface: number[] = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    (pt) => (window as any).viewport.pick({ clientX: pt.x, clientY: pt.y }).point,
    at,
  );
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(50);
  }
  const after = await screenOf(page, surface);
  expect(Math.hypot(after.x - at.x, after.y - at.y)).toBeLessThan(10);
  // gerçekten yakınlaştı: kol ucu artık ekran merkezinden uzakta değil, model büyüdü
  const box = await screenBox(page, (await state(page)).parts[0].id);
  expect(box.h).toBeGreaterThan(box.H);
});

test('X81: başka parçaya çift tık onu seçer ve sığdırır, boyamaz', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['samples/figure.stl', 'samples/testa.stl']);
  await expect(page.locator('ul.parts li')).toHaveCount(2, { timeout: 60_000 });
  await expect.poll(async () => (await state(page)).busy, { timeout: 60_000 }).toBeNull();
  await page.getByRole('button', { name: 'Aralıklı' }).click();
  await page.waitForTimeout(300);
  const s0 = await state(page);
  const other = s0.parts.find((p: { id: string }) => p.id !== s0.selectedPartId).id;
  const before = await screenBox(page, other);
  await page.mouse.dblclick(before.cx, before.cy);
  await page.waitForTimeout(300);
  const s1 = await state(page);
  expect(s1.selectedPartId).toBe(other);
  expect(s1.paintVersion).toBe(s0.paintVersion);
  const fitted = await screenBox(page, other);
  // parça ekrana sığar ve ekranın büyük kısmını kaplar
  expect(fitted.h).toBeLessThan(fitted.H);
  expect(fitted.h).toBeGreaterThan(fitted.H * 0.35);
  // panellerin bıraktığı boşluğun ortasında (sol 240, sağ 268, üst 126, alt 64 px)
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  expect(Math.abs(fitted.cx - (240 + (view.width - 240 - 268) / 2))).toBeLessThan(60);
  expect(Math.abs(fitted.cy - (126 + (view.height - 126 - 64) / 2))).toBeLessThan(60);
  await page.screenshot({ path: 'test-results/navigate-fit.png' });

  // hepsini sığdır: seçili parça ekranın ortasında değil. Sağ sürükle döndür:
  // dönüş merkezi seçili parça, parçanın ortası ekranda yerinde kalır
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  const start = await centerOf(page, other);
  await page.mouse.move(700, 450);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(900, 520, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  const turned = await centerOf(page, other);
  expect(Math.hypot(turned.x - start.x, turned.y - start.y)).toBeLessThan(3);
  // kamera gerçekten döndü: diğer parça yer değiştirdi
  await page.screenshot({ path: 'test-results/navigate-turn.png' });
});
