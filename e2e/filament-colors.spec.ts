import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

const GROGU = `${homedir()}/Downloads/Grogu_Bambu_Colour.3mf`;

/** 3MF'teki nesne filamentleri, nesne sırasıyla. */
function extruders(bytes: Uint8Array): number[] {
  const cfg = strFromU8(unzipSync(bytes)['Metadata/model_settings.config']);
  return [...cfg.matchAll(/<object id="([^"]+)">([\s\S]*?)<\/object>/g)].map((m) =>
    Number(/key="extruder" value="(\d+)"/.exec(m[2].split('<part')[0])?.[1]),
  );
}

const count = (xs: number[]) =>
  xs.reduce<Record<number, number>>((acc, x) => {
    acc[x] = (acc[x] ?? 0) + 1;
    return acc;
  }, {});

test('X109: 3MF nesne filamenti gövde rengi olur ve aynı numarayla geri yazılır', async ({
  page,
}) => {
  test.skip(!existsSync(GROGU), 'model yok');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(GROGU);
  await expect(page.locator('ul.parts li')).toHaveCount(12, { timeout: 180_000 });
  await expect(page.locator('.status')).toContainText(
    'Grogu_Bambu_Colour: 12 gövde 3 filamentte (Filament 3, 6, 7).',
  );

  const s = await state(page);
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  expect(count(s.parts.map((p: any) => p.colorSlot))).toEqual({ 3: 2, 6: 3, 7: 7 });
  // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
  const slot = (id: number) => s.slots.find((x: any) => x.id === id);
  expect(slot(3)).toMatchObject({ name: 'Filament 3', color: '#161616', filament: 3 });
  expect(slot(6)).toMatchObject({ name: 'Filament 6', color: '#008000', filament: 6 });
  expect(slot(7)).toMatchObject({ name: 'Filament 7', color: '#7c4b00', filament: 7 });
  // ağaçta gövde rengi 3 farklı
  const swatches = await page
    .locator('ul.parts .body-swatch')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set(swatches).size).toBe(3);

  // hiçbir şey değiştirmeden Bambu 3MF: numaralar kaynaktakiyle aynı
  const source = extruders(readFileSync(GROGU));
  const download = page.waitForEvent('download');
  await page.getByText('Dışa aktar').click();
  await page.getByRole('button', { name: /3MF — Bambu/ }).click();
  const out = extruders(readFileSync((await (await download).path()) as string));
  expect(count(out)).toEqual(count(source));
  expect(count(out)).toEqual({ 3: 2, 6: 3, 7: 7 });
  await page.screenshot({ path: 'test-results/filament-colors.png' });
  expect(errors).toEqual([]);
});
