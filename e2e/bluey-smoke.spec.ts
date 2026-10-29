import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const FILE = '/Users/yunuskorkmaz/Downloads/Bluey_Color.3mf';

test.skip(!existsSync(FILE), 'Bluey_Color.3mf indirilenlerde yok');

test('Bluey boyalı modeli basılabilir parçalara ayır', async ({ page }) => {
  test.setTimeout(3_000_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(FILE);
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 180_000 });
  await expect(page.locator('.msg', { hasText: 'filament' })).toBeVisible({ timeout: 180_000 });

  const loaded = await page.evaluate(() => {
    const s = (window as unknown as { app: { store: { get: () => AppSnap } } }).app.store.get();
    const labels = s.parts[0].mesh.labels;
    const counts: Record<number, number> = {};
    for (let i = 0; i < labels.length; i++) {
      const id = labels[i] ?? 0;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return {
      name: s.parts[0].name,
      tris: labels.length,
      slots: s.slots.map((x) => ({ id: x.id, name: x.name, color: x.color })),
      counts,
    };
  });
  console.log('yüklendi', JSON.stringify(loaded));
  await page.screenshot({ path: 'test-results/bluey-loaded.png' });

  const cuts = Object.entries(loaded.counts)
    .map(([id, n]) => ({ id: Number(id), n }))
    .filter((x) => x.id !== 0)
    .sort((a, b) => a.n - b.n);
  cuts.pop();

  for (const cut of cuts) {
    const slot = loaded.slots.find((s) => s.id === cut.id);
    const part = await page.evaluate((slotId) => {
      const s = (window as unknown as { app: { store: { get: () => AppSnap } } }).app.store.get();
      const p = s.parts.find(
        (part) => part.visible && part.badge !== 'source' && part.mesh.labels.includes(slotId),
      );
      return p ? { name: p.name } : null;
    }, cut.id);
    if (!part) {
      console.log('atlandı', cut.id, 'boya kalmadı');
      continue;
    }
    const rows = page.locator('ul.parts li');
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      if ((await rows.nth(i).locator('input.name').inputValue()) === part.name) {
        await rows.nth(i).click();
        break;
      }
    }
    await page.locator('ul.slots li').nth(cut.id).locator('.key').click();
    const mode = cut.n > 80_000 ? 'Pimli kes' : 'Tapa';
    await page.locator('.ribbon').getByRole('button', { name: mode, exact: true }).click();
    const before = await page.evaluate(
      () =>
        (window as unknown as { app: { store: { get: () => AppSnap } } }).app.store.get().messages
          .length,
    );
    await page.getByRole('button', { name: 'Kes', exact: true }).click();
    await page.waitForFunction(
      (n) => {
        const s = (window as unknown as { app: { store: { get: () => AppSnap } } }).app.store.get();
        return !!s.busy || s.messages.length > n;
      },
      before,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () => !(window as unknown as { app: { store: { get: () => AppSnap } } }).app.store.get().busy,
      null,
      { timeout: 600_000 },
    );
    const after = await page.evaluate(() => {
      const s = (window as unknown as { app: { store: { get: () => AppSnap } } }).app.store.get();
      return {
        parts: s.parts.map((p) => ({
          name: p.name,
          visible: p.visible,
          badge: p.badge,
          tris: p.mesh.labels.length,
          manifold: p.manifold,
        })),
        last: s.messages.slice(-3).map((m) => `${m.kind}: ${m.text}`),
      };
    });
    console.log(`kes ${slot?.name} (${cut.n})`, JSON.stringify(after));
    await page.screenshot({ path: `test-results/bluey-cut-${cut.id}.png` });
    const failed = after.last.some((m) => m.startsWith('error:'));
    if (failed) break;
  }

  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByText(/^Dışa aktar/).click();
  await page.getByRole('button', { name: /3MF — Bambu/ }).click();
  const file = await download;
  await file.saveAs('test-results/bluey-parcalar.3mf');
  await page.screenshot({ path: 'test-results/bluey-done.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});

interface AppSnap {
  parts: {
    name: string;
    visible: boolean;
    badge: string | null;
    manifold: boolean;
    mesh: { labels: { includes: (n: number) => boolean; length: number; [i: number]: number } };
  }[];
  slots: { id: number; name: string; color: string }[];
  messages: { kind: string; text: string }[];
  busy: string | null;
}
