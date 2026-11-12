import { describe, expect, it } from 'vitest';
import { defaultShortcuts, keySignature, loadShortcuts, shortcutAction, shortcutError } from '../src/domain/shortcuts';
describe('custom keyboard shortcuts', () => {
  it('rejects duplicate shortcuts and default aliases', () => {
    expect(shortcutError('open', 'Ctrl+KeyS', defaultShortcuts)).toContain('Guardar');
    expect(shortcutError('open', 'Ctrl+Shift+KeyZ', defaultShortcuts)).toContain('Rehacer');
  });
  it('rejects system combinations and plain typing keys', () => {
    expect(shortcutError('save', 'Alt+F4', defaultShortcuts)).toContain('reservada');
    expect(shortcutError('save', 'KeyA', defaultShortcuts)).toContain('Ctrl');
    expect(shortcutError('save', 'Ctrl+KeyR', defaultShortcuts)).toContain('reservada');
    expect(shortcutError('save', 'Ctrl+KeyC', defaultShortcuts)).toContain('reservada');
  });
  it('reloads changed and disabled mappings and supports swapped keys', () => {
    const changed = { ...defaultShortcuts, save: 'Ctrl+Alt+KeyS', open: '' };
    expect(loadShortcuts(JSON.stringify(changed))).toEqual(changed);
    const swapped = { ...defaultShortcuts, save: 'Ctrl+KeyO', open: 'Ctrl+KeyS' };
    expect(loadShortcuts(JSON.stringify(swapped))).toEqual(swapped);
  });
  it('falls back to safe defaults for corrupt or colliding stored settings', () => {
    expect(loadShortcuts('bad-json')).toEqual(defaultShortcuts);
    expect(loadShortcuts(JSON.stringify({ save: 'Ctrl+KeyO' }))).toEqual(defaultShortcuts);
  });
  it('removes the old shortcut and aliases when an action is reassigned', () => {
    const changed = { ...defaultShortcuts, redo: 'Ctrl+Alt+KeyY' };
    expect(shortcutAction('Ctrl+KeyY', changed)).toBeUndefined(); expect(shortcutAction('Ctrl+Shift+KeyZ', changed)).toBeUndefined();
    expect(shortcutAction('Ctrl+Alt+KeyY', changed)).toBe('redo');
  });
  it('normalizes physical keys and ignores composition and bare modifiers', () => {
    const event = { code: 'KeyS', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, isComposing: false };
    expect(keySignature(event)).toBe('Ctrl+Alt+KeyS');
    expect(keySignature({ ...event, isComposing: true })).toBe(''); expect(keySignature({ ...event, code: 'ControlLeft' })).toBe('');
  });
});
