import { describe, expect, it } from 'vitest';
import { Workspace } from '../src/domain/workspace';
import { count, type Document, type Invoke } from '../src/domain/types';
import { formatSelection } from '../src/editor/formatting';

function document(): Document { return { id: 'a', title: 'Capítulo.md', path: 'C:/novela/Capítulo.md', text: 'Base', baseText: 'Base', diskHash: 'hash', format: { encoding: 'UTF-8', eol: 'CRLF' }, recovered: false }; }
function setup(handler: (command: string, args: Record<string, unknown>) => Promise<unknown> = async () => undefined) {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const invoke: Invoke = async <T>(command: string, args: Record<string, unknown> = {}) => {
    calls.push({ command, args });
    if (command === 'bootstrap') return { documents: [document()], recents: [], warning: null } as T;
    const result = await handler(command, args);
    return (command === 'save_document' && result ? { document: result, warnings: [] } : result) as T;
  };
  return { store: new Workspace(invoke), calls };
}

describe('workspace persistence boundaries', () => {
  it.each([
    ['open', 'open_document'], ['folder', 'open_folder'], ['save-as', 'save_document'], ['export', 'export_document'],
  ])('persists pending edits before the %s native dialog can block the queue', async (action, command) => {
    const { store, calls } = setup(async () => null);
    await store.initialize(); store.edit('a', 'Texto escrito justo antes del diálogo');
    if (action === 'open') await store.open();
    else if (action === 'folder') await store.openFolder();
    else if (action === 'save-as') await store.save(true);
    else await store.exportCopy();
    const recovery = calls.findIndex(c => c.command === 'checkpoint');
    const dialog = calls.findIndex(c => c.command === command);
    expect(recovery).toBeGreaterThanOrEqual(0); expect(recovery).toBeLessThan(dialog);
  });
  it('keeps edits made while a save is in flight, then checkpoints the newer text', async () => {
    let resolve!: (value: Document) => void; let started!: () => void; const saving = new Promise<void>(r => { started = r; });
    const { store, calls } = setup(async command => { if (command === 'save_document') { started(); return new Promise<Document>(r => { resolve = r; }); } });
    await store.initialize(); store.edit('a', 'Primero'); const save = store.save(); await saving;
    store.edit('a', 'Segundo'); resolve({ ...document(), text: 'Primero', baseText: 'Primero' }); await save;
    expect(store.snapshot().tabs[0].text).toBe('Segundo'); expect(store.snapshot().tabs[0].baseText).toBe('Primero');
    expect(calls.find(c => c.command === 'checkpoint')?.args.text).toBe('Segundo');
  });
  it('does not close or clear recovery when the user cancels', async () => {
    const { store, calls } = setup(async command => command === 'confirm_discard' ? 'cancel' : undefined);
    await store.initialize(); store.edit('a', 'Cambios'); expect(await store.close('a')).toBe(false);
    expect(store.snapshot().tabs).toHaveLength(1); expect(calls.some(c => c.command === 'close_document')).toBe(false);
  });
  it('leaves the tab open after save-as cancellation during close', async () => {
    const { store } = setup(async command => command === 'confirm_discard' ? 'save' : command === 'save_document' ? null : undefined);
    await store.initialize(); store.edit('a', 'Cambios'); expect(await store.close('a')).toBe(false); expect(store.snapshot().tabs).toHaveLength(1);
  });
  it('reports save failure without resetting the baseline', async () => {
    const { store } = setup(async command => { if (command === 'save_document') throw 'CONFLICTO'; });
    await store.initialize(); store.edit('a', 'Cambios'); await store.save();
    expect(store.snapshot().error).toBe('CONFLICTO'); expect(store.snapshot().tabs[0].baseText).toBe('Base'); expect(store.snapshot().busy).toBe(false);
  });
  it('retries a failed recovery and only confirms persistence on success', async () => {
    let attempts = 0;
    const { store } = setup(async command => { if (command === 'checkpoint' && attempts++ === 0) throw 'Disco lleno'; });
    await store.initialize(); store.edit('a', 'Cambios'); await store.checkpoint(); expect(store.snapshot().tabs[0].recovery).toBe('error');
    await store.checkpoint(); expect(store.snapshot().tabs[0].recovery).toBe('saved'); expect(attempts).toBe(2);
  });
  it('never marks a newer edit as recovered using an older checkpoint', async () => {
    let resolve!: () => void; let started!: () => void; const writing = new Promise<void>(r => { started = r; });
    const { store } = setup(async command => { if (command === 'checkpoint') { started(); await new Promise<void>(r => { resolve = r; }); } });
    await store.initialize(); store.edit('a', 'Primero'); const checkpoint = store.checkpoint(); await writing;
    store.edit('a', 'Segundo'); resolve(); await checkpoint; expect(store.snapshot().tabs[0].recovery).toBe('pending');
  });
  it('flags external changes without replacing local text', async () => {
    const { store } = setup(async command => command === 'check_external');
    await store.initialize(); store.edit('a', 'Cambios'); await store.checkExternal(); expect(store.snapshot().tabs[0].external).toBe(true); expect(store.snapshot().tabs[0].text).toBe('Cambios');
  });
  it('exports a copy without changing the source path or dirty baseline', async () => {
    const { store } = setup(async command => command === 'export_document' ? 'C:/copia.txt' : undefined);
    await store.initialize(); store.edit('a', 'Borrador'); await store.exportCopy();
    expect(store.snapshot().tabs[0].path).toBe('C:/novela/Capítulo.md'); expect(store.snapshot().tabs[0].baseText).toBe('Base');
    expect(store.snapshot().notice).toContain('copia.txt');
  });
  it('handles OS requests for an already open file without discarding edits', async () => {
    const { store } = setup(async command => command === 'open_pending' ? { documents: [document()], warning: null } : undefined);
    await store.initialize(); store.edit('a', 'Borrador'); await store.openPending();
    expect(store.snapshot().tabs).toHaveLength(1); expect(store.snapshot().tabs[0].text).toBe('Borrador');
  });
});

describe('text operations', () => {
  it('counts Unicode code points and words including accented characters', () => {
    expect(count('¡Árbol, mar! 😀')).toEqual({ words: 2, characters: 14 });
    expect(count('')).toEqual({ words: 0, characters: 0 });
  });
  it('adds and removes inline formatting around the selection', () => {
    expect(formatSelection('Hola mundo', 5, 10, 'bold')).toEqual({ from: 5, to: 10, insert: '**mundo**', anchor: 7, head: 12 });
    expect(formatSelection('Hola **mundo**', 7, 12, 'bold').insert).toBe('mundo');
    expect(formatSelection('á', 0, 1, 'underline').insert).toBe('<u>á</u>');
  });
  it('formats the selected lines without altering adjacent paragraphs', () => {
    const edit = formatSelection('Uno\nDos\nTres', 0, 7, 'quote'); expect(edit.insert).toBe('> Uno\n> Dos'); expect(edit.to).toBe(7);
  });
  it('changes heading level and restores normal text without stacking marks', () => {
    expect(formatSelection('## Capítulo\n\nTexto', 3, 8, 'title').insert).toBe('# Capítulo');
    expect(formatSelection('# Capítulo', 2, 10, 'subtitle').insert).toBe('## Capítulo');
    expect(formatSelection('### Capítulo', 4, 12, 'normal').insert).toBe('Capítulo');
  });
  it('keeps unselected lines outside block formatting at newline boundaries', () => {
    expect(formatSelection('Uno\nDos\nTres', 0, 8, 'quote').insert).toBe('> Uno\n> Dos');
    expect(formatSelection('\nTexto', 0, 0, 'title').to).toBe(0);
  });
});
