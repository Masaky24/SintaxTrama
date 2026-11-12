import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import type { EditorHandle } from './editor/engine';
import { forgetEditor } from './editor/cache';
import { Workspace } from './domain/workspace';
import { dirty, type Entry, type Invoke } from './domain/types';
import { bridge, native } from './platform/bridge';
import { Settings } from './components/Settings';
import { Proofreading } from './components/Proofreading';
import { defaultShortcuts, keySignature, loadShortcuts, shortcutAction, shortcutLabel, wasDefaultShortcut } from './domain/shortcuts';

const workspace = new Workspace(bridge);
const Editor = lazy(() => import('./editor/Editor').then(module => ({ default: module.Editor })));
function preference(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Preferences are optional; manuscripts use Rust storage. */ } }

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  return <details className="menu"><summary>{label}</summary><div className="menu-popover" onClick={e => e.currentTarget.closest('details')?.removeAttribute('open')}>{children}</div></details>;
}
function Item({ children, shortcut, onClick, disabled = false }: { children: React.ReactNode; shortcut?: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick}><span>{children}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>;
}

export default function App({ store = workspace, invoke = bridge, desktop = native }: { store?: Workspace; invoke?: Invoke; desktop?: boolean }) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const doc = state.tabs.find(t => t.id === state.activeId);
  const editor = useRef<EditorHandle | null>(null);
  const [theme, setTheme] = useState(() => preference('theme', 'dark'));
  const [mode, setMode] = useState<'novel' | 'markdown'>(() => preference('mode', 'novel') === 'markdown' ? 'markdown' : 'novel');
  const [indent, setIndent] = useState(() => preference('indent', 'false') === 'true');
  const [fontSize, setFontSize] = useState(() => Math.max(14, Math.min(28, Number(preference('fontSize', '19')) || 19)));
  const [readingFont, setReadingFont] = useState(() => preference('readingFont', 'Georgia'));
  const [titleSize, setTitleSize] = useState(() => Math.max(22, Math.min(48, Number(preference('titleSize', '30')) || 30)));
  const [wrap, setWrap] = useState(() => preference('wrap', 'false') === 'true');
  const [showSpaces, setShowSpaces] = useState(() => preference('showSpaces', 'false') === 'true');
  const [settings, setSettings] = useState(false);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(preference('shortcuts', '{}')));
  const shortcutText = (action: keyof typeof shortcuts) => shortcutLabel(shortcuts[action]);
  const formatTitle = (action: string, title: string) => action in shortcuts ? `${title.split(' (')[0]} (${shortcutText(action as keyof typeof shortcuts)})` : title;
  const [pageZoom, setPageZoom] = useState(() => Math.max(50, Math.min(200, Number(preference('pageZoom', '100')) || 100)));
  const [autosave, setAutosave] = useState(() => { const value = Number(preference('autosave', '0')); return [0, 15, 30, 60, 120, 300].includes(value) ? value : 0; });
  const [proofreading, setProofreading] = useState(() => preference('proofreading', 'true') === 'true');
  const [technicalFont, setTechnicalFont] = useState(() => preference('technicalFont', 'Consolas'));
  const [fonts, setFonts] = useState(['Georgia', 'Cambria', 'Segoe UI', 'Consolas']);
  const [fontError, setFontError] = useState<string | null>(null);
  const fontsLoaded = useRef(false);
  const [ignored, setIgnored] = useState<string[]>(() => { try { const values = JSON.parse(preference('ignoredWords', '[]')); return Array.isArray(values) ? values.filter(v => typeof v === 'string').slice(0, 5000) : []; } catch { return []; } });
  const [blockType, setBlockType] = useState('normal');
  const [cursor, setCursor] = useState([1, 1]); const [stats, setStats] = useState({ words: 0, characters: 0 });
  const [expanded, setExpanded] = useState<Record<string, Entry[]>>({}); const [folderError, setFolderError] = useState<string | null>(null);
  const initialized = useRef(false); const closing = useRef(false);
  const previousTabs = useRef<string[]>([]);
  const close = async (id: string) => { await store.close(id); if (!store.snapshot().tabs.some(t => t.id === id)) forgetEditor(id); };
  useEffect(() => {
    let unlisten: (() => void) | undefined; let disposed = false;
    if (desktop && !initialized.current) {
      initialized.current = true;
      void listen('files-pending', () => { void store.openPending(); }).then(fn => {
        if (disposed) fn(); else unlisten = fn;
        return store.initialize();
      }).catch(error => { console.error(error); void store.initialize(); });
    }
    return () => { disposed = true; unlisten?.(); };
  }, [desktop, store]);
  useEffect(() => {
    const ids = state.tabs.map(t => t.id); previousTabs.current.filter(id => !ids.includes(id)).forEach(forgetEditor); previousTabs.current = ids;
  }, [state.tabs]);
  useEffect(() => { document.documentElement.dataset.theme = theme; remember('theme', theme); }, [theme]);
  useEffect(() => { remember('mode', mode); }, [mode]);
  useEffect(() => { remember('indent', String(indent)); }, [indent]);
  useEffect(() => { remember('wrap', String(wrap)); }, [wrap]);
  useEffect(() => { remember('showSpaces', String(showSpaces)); }, [showSpaces]);
  useEffect(() => { remember('fontSize', String(fontSize)); document.documentElement.style.setProperty('--editor-size', `${fontSize}px`); }, [fontSize]);
  useEffect(() => { remember('titleSize', String(titleSize)); document.documentElement.style.setProperty('--title-size', `${titleSize}px`); }, [titleSize]);
  useEffect(() => { remember('readingFont', readingFont); document.documentElement.style.setProperty('--reading-font', JSON.stringify(readingFont)); }, [readingFont]);
  useEffect(() => { remember('technicalFont', technicalFont); document.documentElement.style.setProperty('--technical-font', JSON.stringify(technicalFont)); }, [technicalFont]);
  useEffect(() => { remember('autosave', String(autosave)); if (!autosave) return; const timer = window.setInterval(() => { void store.autoSave(); }, autosave * 1000); return () => clearInterval(timer); }, [autosave, store]);
  useEffect(() => { remember('proofreading', String(proofreading)); if (!proofreading) editor.current?.corrections([]); }, [proofreading]);
  useEffect(() => { remember('ignoredWords', JSON.stringify(ignored)); }, [ignored]);
  useEffect(() => { remember('shortcuts', JSON.stringify(shortcuts)); }, [shortcuts]);
  useEffect(() => { remember('pageZoom', String(pageZoom)); document.documentElement.style.setProperty('--page-zoom', String(pageZoom / 100)); }, [pageZoom]);
  useEffect(() => {
    if (!doc) setStats({ words: 0, characters: 0 });
  }, [doc?.id]);
  useEffect(() => { document.title = `${doc ? (dirty(doc) ? '● ' : '') + doc.title + ' — ' : ''}SintaxTrama`; }, [doc?.title, doc?.text, doc?.baseText]);
  useEffect(() => {
    const timer = window.setInterval(() => { void store.checkpoint(); }, 3000);
    const focus = () => { void store.checkExternal(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [store]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void store.checkpoint(); }, 900); return () => clearTimeout(timer);
  }, [doc?.text, doc?.note, store]);
  useEffect(() => {
    let unlisten: (() => void) | undefined; let disposed = false;
    if (!desktop) return;
    void getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault(); if (closing.current) return; closing.current = true;
      try { if (await store.closeAll()) await getCurrentWindow().destroy(); }
      finally { closing.current = false; }
    }).then(fn => { if (disposed) fn(); else unlisten = fn; }).catch(console.error);
    return () => { disposed = true; unlisten?.(); };
  }, [desktop, store]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.isComposing || target?.closest('[data-shortcut-input]')) return;
      const signature = keySignature(event); if (!signature) return;
      let action = shortcutAction(signature, shortcuts);
      if (!action && event.ctrlKey && !event.altKey && event.key === '+' && shortcuts.fontIncrease === defaultShortcuts.fontIncrease) action = event.shiftKey && shortcuts.zoomIncrease === defaultShortcuts.zoomIncrease ? 'zoomIncrease' : 'fontIncrease';
      if (action === 'correct') {
        if (!target?.closest('.cm-editor')) return;
        if (editor.current?.correctSelection() || signature !== 'Tab') { event.preventDefault(); event.stopPropagation(); }
        return;
      }
      if (!action) {
        if (signature !== 'Tab' && !target?.closest('input,textarea,select') && wasDefaultShortcut(signature)) { event.preventDefault(); event.stopPropagation(); }
        return;
      }
      if (target?.closest('input,textarea,select') && ['undo', 'redo', 'bold', 'italic', 'underline', 'search', 'replace', 'goto'].includes(action)) return;
      event.preventDefault(); event.stopPropagation();
      if (settings && action !== 'settings') return;
      if (action === 'settings') { setSettings(v => !v); return; }
      if (action === 'mode') { setMode(m => m === 'novel' ? 'markdown' : 'novel'); return; }
      if (action === 'wrap') { setWrap(v => !v); return; }
      if (action.startsWith('font')) { setFontSize(n => action === 'fontReset' ? 19 : Math.max(14, Math.min(28, n + (action === 'fontDecrease' ? -1 : 1)))); return; }
      if (action.startsWith('zoom')) { setPageZoom(n => action === 'zoomReset' ? 100 : Math.max(50, Math.min(200, n + (action === 'zoomDecrease' ? -10 : 10)))); return; }
      if (action === 'nextTab' || action === 'previousTab') {
        if (state.tabs.length) { const index = state.tabs.findIndex(t => t.id === state.activeId); store.activate(state.tabs[(index + (action === 'previousTab' ? -1 : 1) + state.tabs.length) % state.tabs.length].id); }
        return;
      }
      if (['new', 'open', 'save', 'saveAs', 'close'].includes(action)) {
        if (state.busy) return;
        if (action === 'new') void store.create();
        if (action === 'open') void store.open();
        if (action === 'save' || action === 'saveAs') void store.save(action === 'saveAs');
        if (action === 'close' && doc) void close(doc.id);
        return;
      }
      editor.current?.action(action === 'goto' ? 'gotoLine' : action === 'replace' ? 'search' : action as 'bold' | 'italic' | 'underline' | 'undo' | 'redo' | 'search');
    };
    window.addEventListener('keydown', listener, true); return () => window.removeEventListener('keydown', listener, true);
  }, [doc?.id, state.busy, state.tabs, state.activeId, store, shortcuts, settings]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') document.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open')); };
    const click = (e: MouseEvent) => document.querySelectorAll('details[open]').forEach(d => { if (!d.contains(e.target as Node)) d.removeAttribute('open'); });
    window.addEventListener('keydown', listener); window.addEventListener('click', click);
    return () => { window.removeEventListener('keydown', listener); window.removeEventListener('click', click); };
  }, []);
  async function loadFonts() {
    if (fontsLoaded.current) return; fontsLoaded.current = true;
    try { const result = await invoke<string[]>('system_fonts'); if (!result?.length) throw new Error('La lista de fuentes requiere Windows.'); setFonts([...new Set([...result, readingFont, technicalFont])].sort((a, b) => a.localeCompare(b))); }
    catch (error) { fontsLoaded.current = false; setFontError(String(error)); }
  }
  const windowAction = (action: 'minimize' | 'toggleMaximize' | 'close') => { if (desktop) void getCurrentWindow()[action]().catch(error => console.error(error)); };
  async function expand(entry: Entry) {
    if (expanded[entry.path]) { setExpanded(old => { const next = { ...old }; delete next[entry.path]; return next; }); return; }
    try { const entries = await invoke<Entry[]>('list_folder', { path: entry.path }); setExpanded(old => ({ ...old, [entry.path]: entries })); setFolderError(null); }
    catch (error) { setFolderError(String(error)); }
  }
  const tree = (entries: Entry[], level = 0): React.ReactNode => entries.map(entry => <div key={entry.path}>
    <button className="tree-row" style={{ paddingLeft: 12 + level * 13 }} title={entry.path} onClick={() => entry.directory ? void expand(entry) : void store.open(entry.path)}>{entry.directory ? expanded[entry.path] ? '▾' : '▸' : '▤'} <span>{entry.title}</span></button>
    {entry.directory && expanded[entry.path] && tree(expanded[entry.path], level + 1)}
  </div>);
  return <div className="app-shell">
    <header className="topbar" data-tauri-drag-region>
      <div className="brand"><img className="app-logo" src="/pliegra-symbol.png" alt=""/><strong>SintaxTrama</strong></div>
      <nav aria-label="Menú principal">
        <Menu label="Archivo">
          <Item shortcut={shortcutText('new')} onClick={() => void store.create()}>Nuevo</Item>
          <Item shortcut={shortcutText('open')} onClick={() => void store.open()}>Abrir…</Item>
          <Item onClick={() => void store.openFolder()}>Abrir carpeta…</Item><hr />
          <Item disabled={!doc} shortcut={shortcutText('save')} onClick={() => void store.save()}>Guardar</Item>
          <Item disabled={!doc} shortcut={shortcutText('saveAs')} onClick={() => void store.save(true)}>Guardar como…</Item>
          <Item disabled={!doc} onClick={() => void store.exportCopy()}>Exportar copia MD/TXT…</Item>
          <Item disabled={!doc?.path} onClick={() => void store.reload()}>Recargar desde disco…</Item>
          <Item disabled={!doc} shortcut={shortcutText('close')} onClick={() => doc && void close(doc.id)}>Cerrar documento</Item>
        </Menu>
        <Menu label="Editar">
          <Item disabled={!doc} shortcut={shortcutText('undo')} onClick={() => editor.current?.action('undo')}>Deshacer</Item>
          <Item disabled={!doc} shortcut={shortcutText('redo')} onClick={() => editor.current?.action('redo')}>Rehacer</Item><hr />
          <Item disabled={!doc} shortcut={shortcutText('search')} onClick={() => editor.current?.action('search')}>Buscar y reemplazar</Item>
        </Menu>
        <Menu label="Ver">
          <Item onClick={() => setMode('novel')}>{mode === 'novel' ? '✓ ' : ''}Escritura</Item><Item onClick={() => setMode('markdown')}>{mode === 'markdown' ? '✓ ' : ''}Markdown</Item><hr />
          <Item disabled={!doc} shortcut={shortcutText('goto')} onClick={() => editor.current?.action('gotoLine')}>Ir a línea…</Item>
          <Item onClick={() => setWrap(v => !v)}>{wrap ? '✓ ' : ''}Ajustar líneas en Markdown</Item>
          <Item onClick={() => setShowSpaces(v => !v)}>{showSpaces ? '✓ ' : ''}Mostrar espacios en Markdown</Item>
        </Menu>
        <button className="settings-button" aria-label="Configuración" title={`Configuración (${shortcutText('settings')})`} onClick={() => setSettings(true)}>⚙ <span>Configuración</span></button>
      </nav>
      <div className="top-actions"><button title={`Deshacer (${shortcutText('undo')})`} aria-label="Deshacer" disabled={!doc} onClick={() => editor.current?.action('undo')}>↶</button><button title={`Rehacer (${shortcutText('redo')})`} aria-label="Rehacer" disabled={!doc} onClick={() => editor.current?.action('redo')}>↷</button>{mode === 'markdown' && <button aria-label="Ajustar líneas" title={`Ajustar líneas (${shortcutText('wrap')}): sin desplazamiento horizontal`} aria-pressed={wrap} onClick={() => setWrap(v => !v)}>↵</button>}<span className="separator"/><button disabled={!doc || state.busy} onClick={() => void store.save()}>Guardar</button></div>
      {desktop && <div className="window-controls"><button aria-label="Minimizar" onClick={() => windowAction('minimize')}>—</button><button aria-label="Maximizar o restaurar" onClick={() => windowAction('toggleMaximize')}>□</button><button aria-label="Cerrar SintaxTrama" onClick={() => windowAction('close')}>×</button></div>}
    </header>
    {!desktop && <div className="notice">Vista web de la interfaz. Las operaciones de archivos requieren la aplicación de escritorio Tauri.</div>}
    {(state.error || state.notice) && <div className={state.error ? 'notice error' : 'notice'} role={state.error ? 'alert' : 'status'}><span>{state.error ?? state.notice}</span><button aria-label="Cerrar aviso" onClick={store.dismiss}>×</button></div>}
    <div className="workspace">
      <aside className="explorer" aria-label="Explorador de documentos">
        <div className="section-heading">EXPLORADOR<button title="Abrir carpeta" aria-label="Abrir carpeta" onClick={() => void store.openFolder()}>＋</button></div>
        <button className="folder-open" onClick={() => void store.openFolder()}>▱ Abrir carpeta…</button>
        <h2>CARPETAS</h2>
        {!state.folders.length && <p className="muted empty-list">Ninguna carpeta abierta</p>}
        {state.folders.map(folder => <div className="folder-tree" key={folder.path}><div className="folder-heading"><button title={folder.path} onClick={() => void expand({ path: folder.path, title: '', directory: true })}>{expanded[folder.path] ? '▾' : '▸'} {folder.path.split(/[\\/]/).pop()}</button><button aria-label={`Cerrar carpeta ${folder.path.split(/[\\/]/).pop()}`} onClick={() => void store.removeFolder(folder.path)}>×</button></div>{expanded[folder.path] && tree(expanded[folder.path], 1)}</div>)}
        {folderError && <p role="alert" className="small-error">{folderError}</p>}
        <h2>DOCUMENTOS ABIERTOS</h2>
        {!state.tabs.length && <p className="muted empty-list">Ningún documento abierto</p>}
        {state.tabs.map(tab => <button className={`document-row ${tab.id === doc?.id ? 'selected' : ''}`} key={tab.id} title={tab.path ?? tab.title} onClick={() => store.activate(tab.id)}><span>▤ {tab.title}</span><span>{dirty(tab) ? '●' : ''}</span></button>)}
        <h2>ÚLTIMOS ABIERTOS</h2>
        {!state.recents.length && <p className="muted empty-list">Sin archivos recientes</p>}
        {state.recents.map(recent => <button className="recent-row" key={recent.path} title={recent.path} onClick={() => void store.open(recent.path)}><span>{recent.title}</span><small>{recent.path.replace(/\\/g, '/').split('/').slice(-2, -1)[0]}</small></button>)}
      </aside>
      <main className="document-area">
        <div className="document-toolbar"><div className="tabs" role="tablist" aria-label="Documentos abiertos">{state.tabs.map(tab => <div className={`tab ${tab.id === doc?.id ? 'active' : ''}`} key={tab.id}><button role="tab" aria-selected={tab.id === doc?.id} onClick={() => store.activate(tab.id)}>{tab.title}{dirty(tab) && <span className="dirty-dot"> ●</span>}</button><button aria-label={`Cerrar ${tab.title}`} onClick={() => void close(tab.id)}>×</button></div>)}</div>{mode === 'novel' && <div className="page-zoom" aria-label="Zoom de la hoja"><button aria-label="Alejar hoja" title={`Alejar hoja (${shortcutText('zoomDecrease')})`} disabled={pageZoom <= 50} onClick={() => setPageZoom(n => Math.max(50, n - 10))}>−</button><button aria-label="Restablecer zoom" title="Restablecer zoom de la hoja" onClick={() => setPageZoom(100)}>{pageZoom}%</button><button aria-label="Acercar hoja" title={`Acercar hoja (${shortcutText('zoomIncrease')})`} disabled={pageZoom >= 200} onClick={() => setPageZoom(n => Math.min(200, n + 10))}>+</button></div>}<div className="mode-switch" aria-label="Modo de edición"><button aria-pressed={mode === 'novel'} onClick={() => setMode('novel')}>Escritura</button><button aria-pressed={mode === 'markdown'} onClick={() => setMode('markdown')}>Markdown</button></div></div>
        {doc?.external && <div className="external-banner" role="alert"><span>El archivo cambió o no está disponible en el disco.</span><button onClick={() => void store.reload()}>Recargar…</button><button onClick={() => void store.save(true)}>Guardar copia…</button></div>}
        {doc ? <Suspense fallback={<div className="editor-loading" role="status">Abriendo editor…</div>}><Editor doc={doc} mode={mode} indent={indent} wrap={wrap} showSpaces={showSpaces} onBlock={setBlockType} onStats={setStats} handle={editor} onEdit={store.edit} onCursor={(line, col) => setCursor([line, col])} /></Suspense> : <div className="empty-editor"><div className="empty-icon">▤</div><h1>SintaxTrama</h1><div className="empty-actions"><button onClick={() => void store.create()}>Nuevo documento <kbd>{shortcutText('new')}</kbd></button><button onClick={() => void store.open()}>Abrir archivo… <kbd>{shortcutText('open')}</kbd></button></div></div>}
      </main>
      <aside className="details-panel" aria-label="Herramientas del documento">
        <h2>DOCUMENTO</h2><h3 title={doc?.path ?? undefined}>{doc?.title ?? 'Sin documento'}</h3>
        <dl className="statistics"><div><dt>Palabras</dt><dd>{stats.words.toLocaleString('es')}</dd></div><div><dt>Caracteres</dt><dd>{stats.characters.toLocaleString('es')}</dd></div></dl>
        <h2>FORMATO RÁPIDO</h2>
        <label className="text-style-label" htmlFor="text-style">Tipo de texto</label>
        <select id="text-style" className="text-style" value={blockType} disabled={!doc} onChange={e => editor.current?.action(e.target.value as 'normal' | 'title' | 'subtitle' | 'section')}>
          <option value="normal">Texto normal</option><option value="title">Título</option><option value="subtitle">Subtítulo</option><option value="section">Sección</option>
        </select>
        <div className="format-grid" onMouseDown={e => e.preventDefault()}>
          {([['bold', 'B', 'Negrita (Ctrl+B)'], ['italic', 'I', 'Cursiva (Ctrl+I)'], ['underline', 'U', 'Subrayado (Ctrl+U)'], ['heading', 'H₂', 'Título'], ['quote', '❞', 'Cita'], ['list', '≡', 'Lista']] as const).map(([action, label, title]) => <button key={action} aria-label={formatTitle(action, title)} title={formatTitle(action, title)} disabled={!doc} className={`format-${action}`} onClick={() => editor.current?.action(action)}>{label}</button>)}
        </div><button className="indent-button" disabled={!doc || mode !== 'novel'} aria-pressed={indent} title="Sangría visual de primera línea; no modifica el archivo" onMouseDown={e => e.preventDefault()} onClick={() => setIndent(v => !v)}>⇥ Sangría de lectura</button>
        {mode === 'markdown' && <><h2>MARKDOWN</h2><div className="format-grid technical-tools" onMouseDown={e => e.preventDefault()}>
          {([['code', '‹/›', 'Código en línea'], ['codeblock', '{ }', 'Bloque de código'], ['link', '↗', 'Enlace Markdown'], ['task', '☑', 'Lista de tareas'], ['table', '▦', 'Tabla Markdown'], ['ordered', '1.', 'Lista numerada'], ['divider', '—', 'Separador'], ['indent', '⇥', 'Aumentar sangría'], ['outdent', '⇤', 'Reducir sangría']] as const).map(([action, label, title]) => <button key={action} title={title} aria-label={title} disabled={!doc} onClick={() => editor.current?.action(action)}>{label}</button>)}
        </div></>}
        <h2>TIPOGRAFÍA</h2><label className="text-style-label" htmlFor="font-family">Fuente</label><select id="font-family" className="text-style" value={mode === 'novel' ? readingFont : technicalFont} onFocus={() => void loadFonts()} onChange={e => (mode === 'novel' ? setReadingFont : setTechnicalFont)(e.target.value)}>{[...new Set([...fonts, readingFont, technicalFont])].map(font => <option key={font} value={font}>{font}</option>)}</select>
        {fontError && <p className="panel-hint">{fontError}</p>}
        <div className="format-grid size-tools"><button aria-label="Reducir texto" title={`Reducir texto (${fontSize} px)`} onClick={() => setFontSize(n => Math.max(14, n - 1))}>A−</button><button aria-label="Aumentar texto" title={`Aumentar texto (${fontSize} px)`} onClick={() => setFontSize(n => Math.min(28, n + 1))}>A+</button><button aria-label="Restablecer texto" title="Restablecer tamaño del texto" onClick={() => setFontSize(19)}>A↺</button><button aria-label="Reducir títulos" title={`Reducir títulos (${titleSize} px)`} onClick={() => setTitleSize(n => Math.max(22, n - 2))}>H−</button><button aria-label="Aumentar títulos" title={`Aumentar títulos (${titleSize} px)`} onClick={() => setTitleSize(n => Math.min(48, n + 2))}>H+</button><button aria-label="Restablecer títulos" title="Restablecer tamaño de títulos" onClick={() => setTitleSize(30)}>H↺</button></div>
        <button className="search-button" disabled={!doc} onClick={() => editor.current?.action('search')}>⌕ Buscar <kbd>{shortcutText('search')}</kbd></button>
        <h2>ESTADO</h2><p className="document-state">{doc ? doc.metadataPending ? 'Guardado con advertencias' : dirty(doc) ? 'Modificado' : 'Guardado' : '—'}</p>
        {doc && <><h2>NOTAS · {doc.title}</h2><textarea className="quick-note" aria-label="Notas rápidas del documento" maxLength={16000} placeholder="Escribir una nota…" value={doc.note ?? ''} onChange={e => store.editNote(doc.id, e.target.value)}/>{doc.notePending && <p className="panel-hint">Guardando nota…</p>}
        {proofreading && <Proofreading doc={doc} invoke={invoke} editor={editor} ignored={ignored} correctionKey={shortcutText('correct')} undoKey={shortcutText('undo')} onIgnore={word => setIgnored(values => [...new Set([...values, word.toLocaleLowerCase('es')])].slice(-5000))}/>}</>}
      </aside>
    </div>
    <footer className="statusbar" role="status"><span className={doc?.recovery === 'error' ? 'status-error' : ''}>{state.busy ? 'Operación en curso…' : doc?.metadataPending ? 'Guardado con advertencias' : doc ? doc.recovery === 'saved' ? '● Recuperación guardada' : dirty(doc) ? '● Modificado' : 'Guardado' : 'Listo'}</span><div><span>{stats.words} palabras</span><span>{stats.characters} caracteres</span><span>{doc?.format.encoding ?? 'UTF-8'}</span><span>{doc?.format.eol ?? 'CRLF'}</span><span>Ln {cursor[0]}, Col {cursor[1]}</span></div></footer>
    {settings && <Settings onClose={() => setSettings(false)} theme={theme} setTheme={setTheme} autosave={autosave} setAutosave={setAutosave} showSpaces={showSpaces} setShowSpaces={setShowSpaces} ignored={ignored.length} clearIgnored={() => setIgnored([])} proofreading={proofreading} setProofreading={setProofreading} shortcuts={shortcuts} setShortcuts={setShortcuts}/>}
  </div>;
}
