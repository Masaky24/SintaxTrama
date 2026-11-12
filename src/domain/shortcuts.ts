export const shortcutDefinitions = [
  ['new', 'Nuevo documento', 'Ctrl+KeyN'], ['open', 'Abrir', 'Ctrl+KeyO'],
  ['save', 'Guardar', 'Ctrl+KeyS'], ['saveAs', 'Guardar como', 'Ctrl+Shift+KeyS'],
  ['close', 'Cerrar pestaña', 'Ctrl+KeyW'], ['nextTab', 'Siguiente pestaña', 'Ctrl+Tab'], ['previousTab', 'Pestaña anterior', 'Ctrl+Shift+Tab'],
  ['undo', 'Deshacer', 'Ctrl+KeyZ'], ['redo', 'Rehacer', 'Ctrl+KeyY'],
  ['search', 'Buscar', 'Ctrl+KeyF'], ['replace', 'Reemplazar', 'Ctrl+KeyH'], ['goto', 'Ir a línea', 'Ctrl+KeyL'],
  ['bold', 'Negrita', 'Ctrl+KeyB'], ['italic', 'Cursiva', 'Ctrl+KeyI'], ['underline', 'Subrayado', 'Ctrl+KeyU'],
  ['correct', 'Corregir palabra seleccionada', 'Tab'],
  ['mode', 'Escritura / Markdown', 'Ctrl+Alt+KeyM'], ['wrap', 'Ajustar líneas', 'Alt+KeyZ'], ['settings', 'Configuración', 'Ctrl+Comma'],
  ['fontIncrease', 'Aumentar texto', 'Ctrl+Equal'], ['fontDecrease', 'Reducir texto', 'Ctrl+Minus'], ['fontReset', 'Restablecer texto', 'Ctrl+Digit0'],
  ['zoomIncrease', 'Acercar hoja', 'Ctrl+Shift+Equal'], ['zoomDecrease', 'Alejar hoja', 'Ctrl+Shift+Minus'], ['zoomReset', 'Restablecer zoom', 'Ctrl+Shift+Digit0'],
] as const;
export type ShortcutAction = typeof shortcutDefinitions[number][0];
export type Shortcuts = Record<ShortcutAction, string>;
export const defaultShortcuts = Object.fromEntries(shortcutDefinitions.map(([action, , key]) => [action, key])) as Shortcuts;
const aliases: Partial<Record<ShortcutAction, string[]>> = {
  redo: ['Ctrl+Shift+KeyZ'], fontIncrease: ['Ctrl+NumpadAdd'], fontDecrease: ['Ctrl+NumpadSubtract'], zoomIncrease: ['Ctrl+Shift+NumpadAdd'], zoomDecrease: ['Ctrl+Shift+NumpadSubtract'],
};
type KeyEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'>;
export function keySignature(event: KeyEvent) {
  if (event.isComposing || /^(Control|Shift|Alt|Meta)/.test(event.code)) return '';
  return [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.code].filter(Boolean).join('+');
}
export function shortcutLabel(signature: string) {
  if (!signature) return 'Sin asignar';
  return signature.replace(/Key([A-Z])/g, '$1').replace(/Digit(\d)/g, '$1').replace('Equal', '=').replace('Minus', '−').replace('Comma', ',').replace('Period', '.').replace('Space', 'Espacio').replace('NumpadAdd', '+ num.').replace('NumpadSubtract', '− num.');
}
export function shortcutError(action: ShortcutAction, signature: string, shortcuts: Shortcuts): string | null {
  if (!signature) return null;
  if (!/^(Ctrl\+)?(Alt\+)?(Shift\+)?(?:Key[A-Z]|Digit\d|F(?:[1-9]|1[0-2])|Tab|Space|Equal|Minus|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Backquote|NumpadAdd|NumpadSubtract)$/.test(signature)) return 'Combinación no admitida.';
  if (['Alt+F4', 'Alt+Tab', 'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Ctrl+KeyR', 'Ctrl+Shift+KeyR', 'Ctrl+KeyC', 'Ctrl+KeyX', 'Ctrl+KeyV', 'Ctrl+KeyA', 'Ctrl+Shift+KeyV', 'F5', 'F11'].includes(signature)) return 'Combinación reservada para la edición, Windows o la vista web.';
  if (!(signature.startsWith('Ctrl+') || signature.startsWith('Alt+') || /^F\d/.test(signature) || action === 'correct' && signature === 'Tab')) return 'Use Ctrl o Alt para no interferir con la escritura.';
  for (const [other, label] of shortcutDefinitions) {
    if (other === action) continue;
    if (shortcuts[other] === signature || shortcuts[other] === defaultShortcuts[other] && aliases[other]?.includes(signature)) return `Ya está asignado a «${label}».`;
  }
  return null;
}
export function loadShortcuts(raw: string | null): Shortcuts {
  let parsed: unknown; try { parsed = JSON.parse(raw ?? '{}'); } catch { return { ...defaultShortcuts }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaultShortcuts };
  const result = { ...defaultShortcuts };
  // Validate the complete mapping together, allowing a saved swap of two keys.
  for (const [action] of shortcutDefinitions) {
    const value = (parsed as Record<string, unknown>)[action];
    if (typeof value === 'string' && value.length < 70) result[action] = value;
  }
  if (shortcutDefinitions.some(([action]) => shortcutError(action, result[action], result))) return { ...defaultShortcuts };
  return result;
}
export function shortcutAction(signature: string, shortcuts: Shortcuts): ShortcutAction | undefined {
  for (const [action] of shortcutDefinitions) if (shortcuts[action] === signature || shortcuts[action] === defaultShortcuts[action] && aliases[action]?.includes(signature)) return action;
  return undefined;
}
export function wasDefaultShortcut(signature: string) { return !!shortcutAction(signature, defaultShortcuts); }
