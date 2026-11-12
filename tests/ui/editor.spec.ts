import { test, expect } from '@playwright/test';

test('custom shortcuts apply, persist, reject conflicts and restore defaults', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await page.getByRole('button', { name: 'Configuración', exact: true }).click(); await page.getByRole('button', { name: 'Atajos', exact: true }).click();
  const save = page.getByLabel('Atajo de Guardar', { exact: true });
  await save.press('Control+o'); await expect(page.getByRole('alert')).toContainText('Abrir'); await expect(save).toHaveValue('Ctrl+S');
  await save.press('Control+Alt+s'); await expect(save).toHaveValue('Ctrl+Alt+S');
  await page.getByLabel('Atajo de Deshacer', { exact: true }).press('Control+Alt+u');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await content.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('Probando atajos.');
  await page.keyboard.press('Control+z'); await expect(content).toContainText('Probando atajos.');
  await page.keyboard.press('Control+Alt+u'); await expect(content).not.toContainText('Probando atajos.');
  await page.keyboard.type('Texto final.'); await page.keyboard.press('Control+s'); await expect(page.locator('.document-state')).toHaveText('Modificado');
  await page.keyboard.press('Control+Alt+s'); await expect(page.locator('.document-state')).toHaveText('Guardado');
  await page.reload(); await page.getByRole('button', { name: 'Configuración', exact: true }).click(); await page.getByRole('button', { name: 'Atajos', exact: true }).click();
  await expect(page.getByLabel('Atajo de Guardar', { exact: true })).toHaveValue('Ctrl+Alt+S');
  await page.getByRole('button', { name: 'Restablecer todos los atajos' }).click(); await expect(page.getByLabel('Atajo de Guardar', { exact: true })).toHaveValue('Ctrl+S');
  await page.screenshot({ path: '../Trabajo/Verificacion/Pliegra-atajos.png' });
});

test('writing page zoom leaves font sizes and Markdown source unchanged', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await page.getByRole('button', { name: 'Escritura', exact: true }).click();
  const paper = page.locator('.novel .cm-editor'); const widthBefore = (await paper.boundingBox())!.width;
  await page.getByRole('button', { name: 'Alejar hoja' }).click(); await expect(page.locator('html')).toHaveCSS('--page-zoom', '0.9');
  expect((await paper.boundingBox())!.width).toBeLessThan(widthBefore);
  await expect(page.locator('.novel-heading-1').first()).toHaveCSS('font-size', '30px'); await expect(page.locator('html')).toHaveCSS('--editor-size', '19px');
  await content.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('Texto con zoom.'); await expect(content).toContainText('Texto con zoom.');
  await page.getByRole('button', { name: 'Acercar hoja' }).click(); await expect(page.locator('html')).toHaveCSS('--page-zoom', '1');
  await page.keyboard.press('Control+Shift+-'); await expect(page.locator('html')).toHaveCSS('--page-zoom', '0.9');
  await page.keyboard.press('Control+Shift+0'); await expect(page.locator('html')).toHaveCSS('--page-zoom', '1');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); await expect(content).toContainText('# Prólogo'); await expect(content).toContainText('Texto con zoom.');
});

test('edit, toggle views without rewriting, undo and redo with buttons, save', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await expect(content).toContainText('Prólogo'); await content.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('Nuevo párrafo.');
  await expect(page.locator('.document-state').first()).toHaveText('Modificado');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); const raw = await content.innerText();
  await page.getByRole('button', { name: 'Escritura', exact: true }).click();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); expect(await content.innerText()).toBe(raw);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click(); await expect(content).not.toContainText('Nuevo párrafo.');
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click(); await expect(content).toContainText('Nuevo párrafo.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(page.locator('.document-state').first()).toHaveText('Guardado');
  expect(errors).toEqual([]);
});

test('formatting, search, recent files, themes and notebook layout', async ({ page }) => {
  await page.goto('/tests/fixture.html');
  await expect(page.getByRole('heading', { name: 'ÚLTIMOS ABIERTOS' })).toBeVisible();
  const content = page.getByRole('textbox', { name: 'Texto del documento' }); await content.click(); await page.keyboard.press('Control+End');
  await page.getByRole('button', { name: 'Negrita (Ctrl+B)', exact: true }).click(); await page.keyboard.type('Final');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); await expect(content).toContainText('**Final**');
  await page.getByRole('button', { name: /Buscar Ctrl/ }).click(); await expect(page.locator('.cm-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Configuración', exact: true }).click(); await page.getByLabel('Tema', { exact: true }).selectOption('light'); await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Escritura', exact: true }).click(); await page.getByLabel('Fuente', { exact: true }).selectOption('Cambria');
  await expect(page.locator('html')).toHaveCSS('--reading-font', '"Cambria"');
  await page.keyboard.press('Control+0'); await page.keyboard.press('Control+=');
  await expect(page.locator('html')).toHaveCSS('--editor-size', '20px');
  await page.setViewportSize({ width: 800, height: 600 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();
});

test('captures the two presentations for visual review', async ({ page }) => {
  await page.goto('/tests/fixture.html');
  await page.getByRole('button', { name: 'Escritura', exact: true }).click();
  await page.getByRole('textbox', { name: 'Texto del documento' }).click(); await page.keyboard.press('Control+End');
  await expect(page.locator('.statistics dd').first()).not.toHaveText('0');
  await page.screenshot({ path: '../Trabajo/Verificacion/Pliegra-vista-novela.png' });
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.screenshot({ path: '../Trabajo/Verificacion/Pliegra-vista-markdown.png' });
});

test('tab switching preserves text and undo history', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await content.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('Texto de prueba.');
  await page.keyboard.press('Control+n'); await expect(page.getByRole('tab', { name: 'Sin título.md' })).toBeVisible();
  await page.getByRole('tab', { name: /Prólogo.md/ }).click(); await expect(content).toContainText('Texto de prueba.');
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click(); await expect(content).not.toContainText('Texto de prueba.');
});

test('paragraph styles and technical editor controls preserve the source', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await content.click(); await page.keyboard.press('Control+Home');
  await page.getByLabel('Tipo de texto', { exact: true }).selectOption('subtitle');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(content).toContainText('## Prólogo'); await expect(page.locator('.cm-lineNumbers')).toBeVisible();
  await expect(page.locator('.cm-foldGutter')).toBeVisible();
  await page.getByLabel('Tipo de texto', { exact: true }).selectOption('normal'); await expect(content).not.toContainText('# Prólogo');
  await content.click(); await page.keyboard.press('Control+l'); await expect(page.locator('.cm-panel input')).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByText('Ver', { exact: true }).click(); await page.getByRole('menuitem', { name: 'Mostrar espacios en Markdown' }).click();
  await expect(page.locator('.cm-highlightSpace').first()).toBeVisible();
});

test('novel view hides formatting marks on the active line and Markdown retains them', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await content.click(); await page.keyboard.press('Control+Home');
  await expect(content).not.toContainText('# Prólogo');
  const marked = '**Negrita** y *cursiva* y <u>subrayado</u>\n> Cita\n- Lista\n[Enlace](https://example.com)';
  await page.keyboard.press('Control+End'); await page.keyboard.type('\n' + marked);
  await expect(content).toContainText('Negrita'); await expect(content).not.toContainText('**'); await expect(content).not.toContainText('<u>');
  await expect(content).not.toContainText('> Cita'); await expect(content).not.toContainText('- Lista'); await expect(content).not.toContainText('example.com');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(content).toContainText('# Prólogo'); await expect(content).toContainText('**Negrita** y *cursiva* y <u>subrayado</u>');
  await page.getByRole('button', { name: 'Escritura', exact: true }).click();
  await expect(content).not.toContainText('**'); await expect(content).not.toContainText('<u>');
});

test('underline toolbar supports an empty selection without invalid decorations', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await content.click(); await page.keyboard.press('Control+End');
  await page.getByRole('button', { name: 'Subrayado (Ctrl+U)', exact: true }).click();
  await page.keyboard.type('Subrayado nuevo'); await expect(content).toContainText('Subrayado nuevo'); await expect(content).not.toContainText('<u>');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); await expect(content).toContainText('<u>Subrayado nuevo</u>');
  expect(errors).toEqual([]);
});

test('body and heading sizes change independently', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const heading = page.locator('.novel-heading-1').first();
  await expect(heading).toHaveCSS('font-size', '30px');
  await page.keyboard.press('Control+='); await expect(page.locator('html')).toHaveCSS('--editor-size', '20px');
  await expect(heading).toHaveCSS('font-size', '30px');
  await page.getByRole('button', { name: 'Aumentar títulos', exact: true }).click();
  await expect(heading).toHaveCSS('font-size', '32px'); await expect(page.locator('html')).toHaveCSS('--editor-size', '20px');
});

for (const mode of ['Markdown', 'Escritura']) test(`selected spelling mistake is corrected with Tab and undone with Ctrl+Z in ${mode}`, async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await page.getByRole('button', { name: mode, exact: true }).click();
  await content.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('\nLa ciudadd');
  await expect(page.locator('.spelling-error')).toHaveText('ciudadd');
  await page.keyboard.press('Control+Shift+ArrowLeft'); await page.keyboard.press('Tab');
  await expect(content).toContainText('La ciudad'); await expect(content).not.toContainText('ciudadd');
  await page.keyboard.press('Control+z'); await expect(content).toContainText('ciudadd');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Tab');
  await expect(content).toContainText('ciudadd');
});

test('Markdown quick tools, wrap, per-file notes and compact settings', async ({ page }) => {
  await page.goto('/tests/fixture.html'); const content = page.getByRole('textbox', { name: 'Texto del documento' });
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar líneas', exact: true }).click(); await expect(page.locator('.cm-lineWrapping')).toBeVisible();
  await expect(page.locator('.top-actions').getByRole('button', { name: 'Ajustar líneas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await content.click(); await page.keyboard.press('Control+End'); await page.getByRole('button', { name: 'Lista de tareas', exact: true }).click(); await expect(content).toContainText('- [ ]');
  await page.getByLabel('Notas rápidas del documento').fill('Recordar el conflicto de la escena.');
  await page.keyboard.press('Control+n'); await expect(page.getByLabel('Notas rápidas del documento')).toHaveValue('');
  await page.getByRole('tab', { name: /Prólogo.md/ }).click(); await expect(page.getByLabel('Notas rápidas del documento')).toHaveValue('Recordar el conflicto de la escena.');
  await expect(page.getByRole('heading', { name: 'RECUPERACIÓN', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+,'); await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible();
  await page.getByLabel('Guardado automático', { exact: true }).selectOption('15');
  await page.getByRole('button', { name: 'Atajos', exact: true }).click(); await expect(page.getByLabel('Atajo de Escritura / Markdown', { exact: true })).toHaveValue('Ctrl+Alt+M');
  await page.screenshot({ path: '../Trabajo/Verificacion/Pliegra-configuracion.png' });
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.getByRole('button', { name: 'Escritura', exact: true }).click(); await expect(content).not.toContainText('[ ]'); await page.screenshot({ path: '../Trabajo/Verificacion/Pliegra-ampliado-novela.png' });
});

test('folder catalog and recent files remain distinct', async ({ page }) => {
  await page.goto('/tests/fixture.html'); await page.getByRole('button', { name: 'Abrir carpeta…', exact: false }).last().click();
  await expect(page.getByRole('heading', { name: 'CARPETAS', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '▸ Novela', exact: true }).click(); await expect(page.locator('.folder-tree .tree-row')).toContainText('Prólogo.md');
  await page.getByRole('button', { name: 'Cerrar carpeta Novela' }).click(); await expect(page.locator('.folder-tree')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ÚLTIMOS ABIERTOS', exact: true })).toBeVisible();
});
