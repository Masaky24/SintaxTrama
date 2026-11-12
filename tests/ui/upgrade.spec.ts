import { test, expect } from '@playwright/test';

test('SintaxTrama retains existing preference keys and document content', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('mode', 'markdown');
    localStorage.setItem('fontSize', '23');
    localStorage.setItem('autosave', '60');
    localStorage.setItem('ignoredWords', JSON.stringify(['Masaky']));
  });
  await page.goto('/tests/fixture.html');
  await expect(page).toHaveTitle(/Prólogo\.md — SintaxTrama/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('--editor-size', '23px');
  const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await expect(content).toContainText('# Prólogo');
  await expect(content).toContainText('**Aquella noche todo estaba a punto de cambiar.**');
  await page.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(page.getByLabel('Guardado automático', { exact: true })).toHaveValue('60');
  await page.getByRole('button', { name: 'Corrección', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('SintaxTrama: 1');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('ignoredWords'))).toContain('Masaky');
});
