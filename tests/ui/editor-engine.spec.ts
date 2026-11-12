import { test, expect } from '@playwright/test';

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/tests/fixture.html');
  await page.getByRole('textbox', { name: 'Texto del documento' }).waitFor();
}

test('editor engine suspends inactive views while preserving text, selection, history and counters', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/editor/CodeMirrorAdapter.ts';
    const { codeMirrorEngine: engine } = await import(modulePath);
    const host = document.createElement('div'); document.body.appendChild(host);
    const documentModel = { id: 'retention-test', title: 'Capítulo.md', text: 'Una escena inicial.' };
    const config = { mode: 'markdown', wrap: true, showSpaces: false };
    const changes: string[] = [], stats: {words:number;characters:number}[] = [];
    const events = { onEdit: (_id: string, text: string) => changes.push(text), onCursor: () => {}, onBlock: () => {}, onStats: (value: {words:number;characters:number}) => stats.push(value) };
    let session = engine.mount(host, documentModel, config, events);
    session.replace(19, 19, '', ' Otro párrafo.');
    session.setSelection({ ranges: [{ anchor: 4, head: 10 }], mainIndex: 0 });
    const edited = session.getText(), selection = session.getSelection();
    const counter = stats.at(-1);
    session.suspend();
    const inactive = { views: host.querySelectorAll('.cm-editor').length, retained: engine.retainedCount() };
    session = engine.mount(host, { ...documentModel, text: edited }, config, events);
    const resumed = { text: session.getText(), selection: session.getSelection(), counter: stats.at(-1) };
    session.configure({ ...config, mode: 'novel' }, documentModel.title);
    session.configure({ ...config, showSpaces: true }, documentModel.title);
    session.action('undo'); const undone = session.getText();
    session.action('redo'); const redone = session.getText();
    session.suspend(); engine.forget(documentModel.id);
    return { edited, selection, counter, inactive, resumed, undone, redone, retainedAfterClose: engine.retainedCount() };
  });
  expect(result.inactive).toEqual({ views: 0, retained: 1 });
  expect(result.resumed).toEqual({ text: result.edited, selection: result.selection, counter: result.counter });
  expect(result.undone).toBe('Una escena inicial.');
  expect(result.redone).toBe(result.edited);
  expect(result.retainedAfterClose).toBe(0);
});

test('closing an active document cannot resurrect its suspended cache during delayed cleanup', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/editor/CodeMirrorAdapter.ts'; const { codeMirrorEngine: engine } = await import(modulePath);
    const host = document.createElement('div'); document.body.appendChild(host);
    const callbacks = { onEdit: () => {}, onCursor: () => {}, onBlock: () => {}, onStats: () => {} };
    const session = engine.mount(host, { id: 'closing-test', title: 'Documento.txt', text: 'Sin guardar' }, { mode: 'markdown', wrap: false, showSpaces: false }, callbacks);
    engine.forget('closing-test'); session.suspend(); session.suspend();
    return { retained: engine.retainedCount(), views: host.querySelectorAll('.cm-editor').length };
  });
  expect(result).toEqual({ retained: 0, views: 0 });
});

test('resuming one document uses fresh callbacks and does not edit another inactive document', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/editor/CodeMirrorAdapter.ts'; const { codeMirrorEngine: engine } = await import(modulePath);
    const host = document.createElement('div'); document.body.appendChild(host);
    const config = { mode: 'markdown', wrap: false, showSpaces: false };
    const oldEvents: string[] = [], newEvents: string[] = [];
    const events = (log: string[]) => ({ onEdit: (id: string, text: string) => log.push(id + ':' + text), onCursor: () => {}, onBlock: () => {}, onStats: () => {} });
    let a = engine.mount(host, { id: 'document-a', title: 'A.md', text: 'A' }, config, events(oldEvents)); a.suspend();
    const b = engine.mount(host, { id: 'document-b', title: 'B.md', text: 'B' }, config, events(oldEvents));
    b.replace(1, 1, '', ' editado'); b.suspend();
    a = engine.mount(host, { id: 'document-a', title: 'A.md', text: 'A' }, config, events(newEvents));
    a.replace(1, 1, '', ' nuevo'); a.suspend();
    const restoredB = engine.mount(host, { id: 'document-b', title: 'B.md', text: 'B editado' }, config, events(newEvents));
    const textB = restoredB.getText(); restoredB.action('undo'); const undoB = restoredB.getText();
    restoredB.suspend(); engine.forget('document-a'); engine.forget('document-b');
    return { oldEvents, newEvents, textB, undoB, retained: engine.retainedCount() };
  });
  expect(result.oldEvents).toEqual(['document-b:B editado']);
  expect(result.newEvents).toEqual(['document-a:A nuevo', 'document-b:B']);
  expect(result.textB).toBe('B editado'); expect(result.undoB).toBe('B'); expect(result.retained).toBe(0);
});

test('React editor host accepts an engine without CodeMirror state or persistence methods', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const editorPath = '/src/editor/Editor.tsx'; const { Editor } = await import(editorPath);
    const reactModule = '/node_modules/.vite/deps/react.js', clientModule = '/node_modules/.vite/deps/react-dom_client.js', domModule = '/node_modules/.vite/deps/react-dom.js';
    const React = (await import(reactModule)).default;
    const { createRoot } = (await import(clientModule)).default;
    const { flushSync } = (await import(domModule)).default;
    const calls: string[] = [], ref = { current: null };
    const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
    const noop = () => {};
    const engine = { name: 'contract-test', forget: noop, retainedCount: () => 0, mount: (_host: HTMLElement, doc: {id:string;text:string}) => {
      calls.push('mount:' + doc.id);
      return { action: (action: string) => calls.push(action), replace: () => false, corrections: noop, correctSelection: () => false,
        updateDocument: noop, configure: noop, updateEvents: noop, getText: () => doc.text,
        getSelection: () => ({ranges:[{anchor:0,head:0}], mainIndex:0}), setSelection: noop, suspend: () => calls.push('suspend:' + doc.id) };
    }};
    const render = (id: string) => flushSync(() => root.render(React.createElement(Editor, { doc: { id, title: 'Texto.txt', text: 'Texto' }, mode:'markdown',indent:false,wrap:false,showSpaces:false,handle:ref,engine,onEdit:noop,onCursor:noop,onBlock:noop,onStats:noop })));
    render('a'); (ref.current as { action: (value:string) => void } | null)?.action('undo'); render('b'); root.unmount();
    return calls;
  });
  expect(result).toEqual(['mount:a', 'undo', 'suspend:a', 'mount:b', 'suspend:b']);
});

test('tab suspension preserves multiple selections, search options and folded ranges', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const adapterPath = '/src/editor/CodeMirrorAdapter.ts', internalsPath = '/tests/editor-internals.ts';
    const { codeMirrorEngine: engine } = await import(adapterPath);
    const { EditorView, SearchQuery, setSearchQuery, getSearchQuery, searchPanelOpen, foldEffect, foldedRanges } = await import(internalsPath);
    const host = document.createElement('div'); document.body.appendChild(host);
    const model = { id:'selection-search-fold', title:'Escena.md', text:'uno\n\ndos\n\ntres\n\ncuatro\n' };
    const config = { mode:'markdown', wrap:false, showSpaces:false };
    const events = { onEdit: () => {}, onCursor: () => {}, onBlock: () => {}, onStats: () => {} };
    let session = engine.mount(host, model, config, events);
    session.setSelection({ ranges:[{anchor:0,head:3},{anchor:16,head:22}], mainIndex:1 });
    session.action('search');
    let view = EditorView.findFromDOM(host.querySelector('.cm-editor'));
    view.dispatch({ effects:[setSearchQuery.of(new SearchQuery({search:'cuatro',replace:'final',wholeWord:true,caseSensitive:true})), foldEffect.of({from:8,to:15})] });
    const capture = () => {
      const folds: {from:number;to:number}[] = [];
      foldedRanges(view.state).between(0, view.state.doc.length, (from:number,to:number) => folds.push({from,to}));
      const query = getSearchQuery(view.state);
      return { selection:session.getSelection(), query:{search:query.search,replace:query.replace,wholeWord:query.wholeWord,caseSensitive:query.caseSensitive}, panelOpen:searchPanelOpen(view.state), folds };
    };
    const before = capture(); session.suspend();
    session = engine.mount(host, model, config, events); view = EditorView.findFromDOM(host.querySelector('.cm-editor'));
    const after = capture(); session.suspend(); engine.forget(model.id);
    return {before,after};
  });
  expect(result.before.selection.ranges).toEqual([{anchor:0,head:3},{anchor:16,head:22}]);
  expect(result.before.folds).toEqual([{from:8,to:15}]);
  expect(result.before.panelOpen).toBe(true);
  expect(result.after).toEqual(result.before);
});
