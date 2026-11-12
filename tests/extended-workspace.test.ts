import { describe, expect, it } from 'vitest';
import { Workspace } from '../src/domain/workspace';
import type { Document, Invoke } from '../src/domain/types';
const base: Document = { id: 'a', title: 'Uno.md', path: 'C:/Novela/Uno.md', text: 'base', baseText: 'base', diskHash: 'a', format: { encoding: 'UTF-8', eol: 'CRLF' }, recovered: false, note: '' };
function setup(documents: Document[] = [base], handler: (command: string, args: Record<string, unknown>) => Promise<unknown> = async () => undefined) {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const invoke: Invoke = async <T>(command: string, args: Record<string, unknown> = {}) => {
    calls.push({ command, args });
    if (command === 'bootstrap') return { documents, recents: [], warning: null } as T;
    if (command === 'save_document') {
      const value = await handler(command, args);
      const result = value ?? { ...documents.find(doc => doc.id === args.id)!, text: args.text, baseText: args.text };
      return (typeof result === 'object' && result && 'document' in result ? result : { document: result, warnings: [] }) as T;
    }
    return await handler(command, args) as T;
  };
  return { store: new Workspace(invoke), calls };
}
describe('automatic saves, notes and competing operations', () => {
  it('adopts a newer note reconciled by the core when there is no local note edit', async () => {
    const { store } = setup([base], async command => command === 'save_document' ? { document: { ...base, note: 'Nota reconciliada', text: 'base', baseText: 'base' }, warnings: [] } : undefined);
    await store.initialize(); await store.save(); expect(store.snapshot().tabs[0].note).toBe('Nota reconciliada');
  });
  it('preserves a note typed while a manuscript save is in flight', async () => {
    let release!: (value: unknown) => void; let notify!: () => void; const started = new Promise<void>(r => { notify = r; });
    const { store } = setup([base], async command => { if (command === 'save_document') { notify(); return new Promise(r => { release = r; }); } });
    await store.initialize(); const saving = store.save(); await started; store.editNote('a','Nota más nueva'); release({ document: base, warnings: [] }); await saving;
    expect(store.snapshot().tabs[0].note).toBe('Nota más nueva'); expect(store.snapshot().tabs[0].notePending).toBe(true);
  });
  it('keeps the document open when closing cannot finish pending metadata', async () => {
    const pending = { ...base, metadataPending: true };
    const { store, calls } = setup([pending], async command => command === 'confirm_discard' ? 'save' : command === 'save_document' ? { document: pending, warnings: ['Nota pendiente.'] } : undefined);
    await store.initialize(); expect(await store.close('a')).toBe(false); expect(store.snapshot().tabs).toHaveLength(1); expect(calls.some(c => c.command === 'close_document')).toBe(false);
  });
  it('accepts a committed save with warnings without claiming that metadata is complete', async () => {
    const { store } = setup([base], async command => command === 'save_document' ? { document: { ...base, text: 'guardado', baseText: 'guardado', diskHash: 'nuevo', metadataPending: true }, warnings: ['Archivo guardado; nota pendiente.'] } : undefined);
    await store.initialize(); store.edit('a', 'guardado');
    expect(await store.save()).toBe(false);
    expect(store.snapshot().tabs[0].baseText).toBe('guardado'); expect(store.snapshot().tabs[0].metadataPending).toBe(true);
    expect(store.snapshot().error).toContain('nota pendiente'); expect(store.snapshot().tabs[0].external).toBe(false);
  });
  it('asks before closing an untitled document containing only a note', async () => {
    const { store, calls } = setup([{ ...base, path: null, text: '', baseText: '' }], async command => command === 'confirm_discard' ? 'cancel' : undefined);
    await store.initialize(); store.editNote('a', 'Solo existe esta nota');
    expect(await store.close('a')).toBe(false); expect(store.snapshot().tabs[0].note).toBe('Solo existe esta nota');
    expect(calls.some(call => call.command === 'confirm_discard')).toBe(true); expect(calls.some(call => call.command === 'close_document')).toBe(false);
  });
  it('retains typing that arrives during a disk reload', async () => {
    let release!: (doc: Document) => void; let notify!: () => void; const started = new Promise<void>(r => { notify = r; });
    const { store } = setup([base], async command => { if (command === 'reload_document') { notify(); return new Promise<Document>(r => { release = r; }); } });
    await store.initialize(); const reload = store.reload(); await started; store.edit('a', 'Texto nuevo mientras se lee');
    release({ ...base, text: 'Disco', baseText: 'Disco' }); await reload;
    expect(store.snapshot().tabs[0].text).toBe('Texto nuevo mientras se lee'); expect(store.snapshot().tabs[0].baseText).toBe('Disco'); expect(store.snapshot().tabs[0].recovery).toBe('saved');
  });
  it('saves only eligible documents without opening dialogs', async () => {
    const docs = [base, { ...base, id: 'new', path: null }, { ...base, id: 'recovered', recovered: true }, { ...base, id: 'mixed', format: { ...base.format, eol: 'Mixto' } }];
    const { store, calls } = setup(docs); await store.initialize(); docs.forEach(doc => store.edit(doc.id, 'nuevo'));
    await store.autoSave(); expect(calls.filter(call => call.command === 'save_document').map(call => call.args.id)).toEqual(['a']);
    expect(calls.find(call => call.command === 'save_document')?.args.saveAs).toBe(false);
  });
  it('retains text typed during autosave and checkpoints the newer version', async () => {
    let release!: (value: unknown) => void; let notify!: () => void;
    const started = new Promise<void>(r => { notify = r; });
    const { store, calls } = setup([base], async command => { if (command === 'save_document') { notify(); return new Promise(resolve => { release = resolve; }); } });
    await store.initialize(); store.edit('a', 'primero'); const saving = store.autoSave(); await started;
    store.edit('a', 'segundo'); release({ ...base, text: 'primero', baseText: 'primero' }); await saving;
    expect(store.snapshot().tabs[0].text).toBe('segundo'); expect(store.snapshot().tabs[0].baseText).toBe('primero');
    expect(calls.some(call => call.command === 'checkpoint' && call.args.text === 'segundo')).toBe(true);
  });
  it('coalesces repeated timers and does not retry a conflict silently', async () => {
    const { store, calls } = setup([base], async command => { if (command === 'save_document') throw new Error('CONFLICTO externo'); });
    await store.initialize(); store.edit('a', 'borrador'); await Promise.all(Array.from({ length: 50 }, () => store.autoSave())); await store.autoSave();
    expect(calls.filter(call => call.command === 'save_document')).toHaveLength(1);
    expect(store.snapshot().tabs[0].external).toBe(true); expect(store.snapshot().tabs[0].text).toBe('borrador');
  });
  it('saves each note under its document and flushes before closing', async () => {
    const { store, calls } = setup([base, { ...base, id: 'b', path: 'C:/Novela/Dos.md' }]); await store.initialize();
    store.editNote('a', 'Nota uno'); store.activate('b'); store.editNote('b', 'Nota dos'); await store.close('a'); await store.checkpoint();
    expect(calls.filter(c => c.command === 'save_note').map(c => [c.args.id, c.args.note])).toEqual([['a', 'Nota uno'], ['b', 'Nota dos']]);
    expect(calls.findIndex(c => c.command === 'save_note')).toBeLessThan(calls.findIndex(c => c.command === 'close_document'));
  });
  it('keeps a failed note pending and reports the error instead of closing', async () => {
    const { store } = setup([base], async command => { if (command === 'save_note') throw 'Disco lleno'; }); await store.initialize();
    store.editNote('a', 'Importante'); await store.close('a'); expect(store.snapshot().tabs).toHaveLength(1); expect(store.snapshot().tabs[0].notePending).toBe(true); expect(store.snapshot().error).toContain('Disco lleno');
  });
  it('does not clear a note typed while an earlier note is being stored', async () => {
    let release!: () => void; let notify!: () => void; const started = new Promise<void>(r => { notify = r; });
    const { store } = setup([base], async command => { if (command === 'save_note') { notify(); await new Promise<void>(r => { release = r; }); } });
    await store.initialize(); store.editNote('a', 'uno'); const pending = store.checkpoint(); await started;
    store.editNote('a', 'dos'); release(); await pending; expect(store.snapshot().tabs[0].note).toBe('dos'); expect(store.snapshot().tabs[0].notePending).toBe(true);
  });
  it('serializes autosave and close without saving a closed document', async () => {
    const { store, calls } = setup(); await store.initialize(); store.edit('a', 'nuevo'); await Promise.all([store.autoSave(), store.close('a'), store.autoSave(), store.checkpoint()]);
    expect(store.snapshot().tabs).toHaveLength(0);
    const closed = calls.findIndex(c => c.command === 'close_document'); expect(calls.slice(closed + 1).some(c => c.command === 'save_document' || c.command === 'checkpoint')).toBe(false);
  });
});
