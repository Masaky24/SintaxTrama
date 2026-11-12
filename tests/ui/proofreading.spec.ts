import { expect, test } from '@playwright/test';

test('debounced native results belong to the exact current revision, even after A to B to A', async ({ page }) => {
  await page.clock.install();
  await page.goto('/tests/proofreading-fixture.html');
  const input = page.getByRole('textbox', { name: 'Entrada de prueba' });
  await expect(input).toHaveValue('A');
  await page.clock.fastForward(1200);
  await expect.poll(() => page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(1);
  await input.fill('B');
  await page.clock.fastForward(1200);
  await input.fill('A');
  await page.clock.fastForward(1200);
  expect(await page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(1);
  await page.evaluate(() => (window as any).reviewProbe.finish(0, 'obsoleto'));
  await expect.poll(() => page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(2);
  await expect(page.getByRole('button', { name: 'obsoleto', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).reviewProbe.finish(1, 'actual'));
  await expect(page.getByRole('button', { name: 'actual', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).reviewProbe.maximum)).toBe(1);
  expect(await page.evaluate(() => (window as any).reviewProbe.diagnostics.flat().some((issue: any) => issue.suggestions.includes('obsoleto')))).toBe(false);
});

test('manual review replaces debounce, while remounts share the active native slot', async ({ page }) => {
  await page.clock.install();
  await page.goto('/tests/proofreading-fixture.html');
  await page.getByRole('button', { name: 'Revisar texto', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(1);
  await page.clock.fastForward(1200);
  expect(await page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(1);
  await page.getByRole('button', { name: 'Alternar revisión' }).click();
  await page.getByRole('button', { name: 'Alternar revisión' }).click();
  await page.clock.fastForward(1200);
  expect(await page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(1);
  await page.evaluate(() => (window as any).reviewProbe.finish(0, 'oculto'));
  await expect.poll(() => page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(2);
  await expect(page.getByRole('button', { name: 'oculto', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).reviewProbe.finish(1, 'visible'));
  await expect(page.getByRole('button', { name: 'visible', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).reviewProbe.maximum)).toBe(1);
});

test('switching to an identical document invalidates a previous document review', async ({ page }) => {
  await page.clock.install();
  await page.goto('/tests/proofreading-fixture.html');
  await page.getByRole('button', { name: 'Revisar texto', exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar documento' }).click();
  await page.clock.fastForward(1200);
  await page.evaluate(() => (window as any).reviewProbe.finish(0, 'otro documento'));
  await expect.poll(() => page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(2);
  await expect(page.getByRole('button', { name: 'otro documento', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).reviewProbe.finish(1, 'documento actual'));
  await expect(page.getByRole('button', { name: 'documento actual', exact: true })).toBeVisible();
});

test('a batched Workspace A to B to A edit invalidates the original native review', async ({ page }) => {
  await page.clock.install();
  await page.goto('/tests/proofreading-fixture.html');
  await page.getByRole('button', { name: 'Revisar texto', exact: true }).click();
  await page.getByRole('button', { name: 'Cambios agrupados' }).click();
  await page.clock.fastForward(1200);
  await page.evaluate(() => (window as any).reviewProbe.finish(0, 'revision anterior'));
  await expect.poll(() => page.evaluate(() => (window as any).reviewProbe.pending.length)).toBe(2);
  await expect(page.getByRole('button', { name: 'revision anterior', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).reviewProbe.finish(1, 'revision actual'));
  await expect(page.getByRole('button', { name: 'revision actual', exact: true })).toBeVisible();
});
