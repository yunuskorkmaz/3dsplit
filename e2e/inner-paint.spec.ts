import { existsSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const FILE = '/Users/yunuskorkmaz/Downloads/Bluey_Color.3mf';

test.skip(!existsSync(FILE), 'Bluey_Color.3mf indirilenlerde yok');

// biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
const state = (page: Page) => page.evaluate(() => (window as any).app.store.get() as any);

test('X113: bölgenin içindeki renk adıyla söylenir, tapadan ayrıca kesilir', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(FILE);
  await expect(page.locator('ul.parts li')).toHaveCount(1, { timeout: 180_000 });

  // turuncu (Filament 5) bölgenin içinde siyah (Filament 4) var
  await page.locator('ul.slots li').nth(5).locator('.key').click();
  await page.locator('.ribbon').getByRole('button', { name: 'Tapa', exact: true }).click();
  await page.getByRole('checkbox', { name: /Önizleme/ }).check();
  const note = page.locator('.preview-warnings li', {
    hasText: 'Bölgenin içinde Filament 4 var (9.102 üçgen); tapaya katılacak.',
  });
  await expect(note).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: 'test-results/inner-paint-preview.png' });

  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /^Kes 1: / })).toBeVisible({ timeout: 300_000 });
  await expect(
    page.locator('.msg', {
      hasText:
        'Bölgenin içinde Filament 4 var (9.102 üçgen); tapaya katıldı. Ayrı basmak için kesimden sonra tapayı seçip Filament 4 setini kes.',
    }),
  ).toBeVisible();

  // tapa siyahı taşır: seçip Filament 4'ü kes
  const plug = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    const s = (window as any).app.store.get();
    return s.parts.find(
      // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
      (p: any) => p.badge === 'new' && p.name.startsWith('Gövde') && p.mesh.labels.includes(4),
    )?.name;
  });
  expect(plug).toBeTruthy();
  const before = (await state(page)).parts.length;
  await page.locator('ul.parts li', { has: page.locator(`input.name[value="${plug}"]`) }).click();
  await page.locator('ul.slots li').nth(4).locator('.key').click();
  await page.locator('.ribbon').getByRole('button', { name: 'Tapa', exact: true }).click();
  await page.getByRole('button', { name: 'Kes', exact: true }).click();
  await expect(page.locator('.msg', { hasText: /^Kes 2: / })).toBeVisible({ timeout: 300_000 });
  // kesilen tapa: eski hali kaynak olur, siyah ayrı parçalar olarak çıkar
  const after = await state(page);
  expect(
    // biome-ignore lint/suspicious/noExplicitAny: geliştirme kancası
    after.parts.some((p: any) => p.name === plug && p.badge === 'source'),
  ).toBe(true);
  expect(after.parts.length).toBeGreaterThanOrEqual(before + 2);
  await expect(page.locator('.msg', { hasText: /^Kes 2: .*\(Tapa · Filament 4\)/ })).toBeVisible();
  expect(errors).toEqual([]);
});
