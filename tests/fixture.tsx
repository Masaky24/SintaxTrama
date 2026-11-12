import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { Workspace } from '../src/domain/workspace';
import type { Document, Invoke } from '../src/domain/types';
import '../src/styles.css';
// UI integration fixture. Native storage is exercised separately by the Rust tests.
const docs = new Map<string, Document>();
const sample: Document = { id: 'sample', title: 'Prólogo.md', path: 'C:/Novela/Prólogo.md', text: '# Prólogo\n\nLa lluvia golpeaba los tejados de la ciudad. Desde la ventana, alguien contemplaba las calles vacías.\n\n**Aquella noche todo estaba a punto de cambiar.**\n\nNadie había previsto lo que sucedería al amanecer.\n', baseText: '', diskHash: 'sample-hash', format: { encoding: 'UTF-8', eol: 'CRLF' }, recovered: false };
sample.baseText = sample.text; docs.set(sample.id, sample);
const invoke: Invoke = async <T,>(command: string, args: Record<string, unknown> = {}) => {
  let result: unknown;
  if (command === 'bootstrap') result = { documents: [...docs.values()], recents: [{ path: sample.path, title: sample.title }], warning: null };
  else if (command === 'system_fonts') result = ['Georgia', 'Cambria', 'Segoe UI', 'Consolas'];
  else if (command === 'spell_check') {
    const text = args.text as string; const from = text.indexOf('ciudadd');
    result = { language: 'es-ES', warning: null, issues: from < 0 ? [] : [{ from, to: from + 7, word: 'ciudadd', suggestions: ['ciudad'] }] };
  }
  else if (command === 'save_note') { const doc = docs.get(args.id as string); if (doc) doc.note = args.note as string; }
  else if (command === 'open_folder') result = { path: 'C:/Novela', entries: [{ path: 'C:/Novela/Prólogo.md', title: 'Prólogo.md', directory: false }] };
  else if (command === 'list_folder') result = [{ path: 'C:/Novela/Prólogo.md', title: 'Prólogo.md', directory: false }];
  else if (command === 'new_document') { const doc = { ...sample, id: crypto.randomUUID(), path: null, title: 'Sin título.md', text: '', baseText: '' }; docs.set(doc.id, doc); result = doc; }
  else if (command === 'save_document') { const doc = { ...docs.get(args.id as string)!, text: args.text as string, baseText: args.text as string }; docs.set(doc.id, doc); result = { document: doc, warnings: [] }; }
  else if (command === 'check_external') result = false;
  else if (command === 'confirm_discard') result = 'discard';
  else if (command === 'close_document') docs.delete(args.id as string);
  return result as T;
};
const store = new Workspace(invoke); void store.initialize();
createRoot(document.getElementById('root')!).render(<App store={store} invoke={invoke} desktop={false} />);
