import { useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Proofreading } from '../src/components/Proofreading';
import type { EditorHandle } from '../src/editor/engine';
import type { Issue, SpellResult } from '../src/domain/proofreading';
import type { Invoke, Tab } from '../src/domain/types';
import { Workspace } from '../src/domain/workspace';

interface Pending { text: string; resolve: (result: SpellResult) => void }
const pending: Pending[] = [];
let active = 0;
const probe = {
  pending,
  maximum: 0,
  diagnostics: [] as Issue[][],
  finish(index: number, suggestion: string) {
    const request = pending[index];
    request.resolve({ language: 'es', warning: null, issues: [{ from: 0, to: 1, word: request.text.slice(0, 1), suggestions: [suggestion] }] });
  },
};
(window as unknown as { reviewProbe: typeof probe }).reviewProbe = probe;
const initial: Tab = { id: 'one', text: 'A', path: null, title: 'Prueba.md', baseText: '', diskHash: null, format: { encoding: 'UTF-8', eol: 'LF' }, recovered: false, external: false, recovery: 'none' };
const reviewInvoke: Invoke = <T,>(command: string, args: Record<string, unknown> = {}) => {
  if (command === 'bootstrap') return Promise.resolve({ documents: [initial], recents: [], warning: null } as T);
  if (command !== 'spell_check') return Promise.resolve(undefined as T);
  probe.maximum = Math.max(probe.maximum, ++active);
  return new Promise<SpellResult>(resolve => pending.push({ text: args.text as string, resolve })).finally(() => { active--; }) as Promise<T>;
};
const store = new Workspace(reviewInvoke);
void store.initialize();
function Fixture() {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const [id, setId] = useState('one');
  const [visible, setVisible] = useState(true);
  const editor = useRef<EditorHandle>({ action: () => {}, replace: () => false, correctSelection: () => false, corrections: issues => { probe.diagnostics.push(issues); } });
  const tab = state.tabs[0];
  if (!tab) return <p>Cargando</p>;
  const doc: Tab = { ...tab, id };
  return <><textarea aria-label="Entrada de prueba" value={tab.text} onChange={event => store.edit(tab.id, event.target.value)} />
    <button onClick={() => { store.edit(tab.id, 'B'); store.edit(tab.id, 'A'); }}>Cambios agrupados</button>
    <button onClick={() => setId(value => value === 'one' ? 'two' : 'one')}>Cambiar documento</button>
    <button onClick={() => setVisible(value => !value)}>Alternar revisión</button>
    {visible && <Proofreading doc={doc} invoke={reviewInvoke} editor={editor} ignored={[]} onIgnore={() => {}} />}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
