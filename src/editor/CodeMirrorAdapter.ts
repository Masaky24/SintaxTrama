import { Compartment, EditorSelection as CMSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightWhitespace, placeholder, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput, foldGutter, foldKeymap, foldState, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown } from '@codemirror/lang-markdown';
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine, getSearchQuery, setSearchQuery, searchPanelOpen, type SearchQuery } from '@codemirror/search';
import { formatSelection } from './formatting';
import { novelPresentation } from './novel';
import { documentStatistics } from './statistics';
import { corrections, setCorrections, correctSelectedWord } from './corrections';
import { registerEditorEngine } from './cache';
import type { EditorAction, EditorConfiguration, EditorDocument, EditorEngine, EditorEvents, EditorSession } from './engine';

// Only these immutable document fields survive suspension: text, selection,
// undo/redo, folds and incremental counters. Parsers, DOM plugins and callbacks do not.
const runtime = new Compartment();
const markdownSupport = markdown();
const presentation = new Compartment();
const language = new Compartment();
const wrapping = new Compartment();
const spaces = new Compartment();
const highlighting = new Compartment();
type InlineAction = 'bold' | 'italic' | 'underline';
const setPendingFormat = StateEffect.define<InlineAction | null>();
const pendingFormat = StateField.define<InlineAction | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setPendingFormat)) return effect.value;
    return transaction.docChanged || transaction.selection ? null : value;
  },
});
const technicalHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent)', fontWeight: 'bold' },
  { tag: tags.strong, fontWeight: 'bold' }, { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: '#80aabb', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--accent)' }, { tag: tags.comment, color: 'var(--muted)' },
]);
const snapshots = new Map<string, { state: EditorState; text: string; scrollTop: number; scrollLeft: number; query: SearchQuery; searchOpen: boolean }>();
const active = new Set<string>();
const retired = new Set<string>();
const quiet: EditorEvents = { onEdit: () => {}, onCursor: () => {}, onBlock: () => {}, onStats: () => {} };
function mount(host: HTMLElement, document: EditorDocument, configuration: EditorConfiguration, initialEvents: EditorEvents): EditorSession {
  const id = document.id;
  if (active.has(id)) throw new Error('El documento ya tiene una superficie de edición activa.');
  retired.delete(id);
  let events = initialEvents, localText = document.text, title = document.title, settings = configuration, suspended = false;
  let isMarkdown = title.toLowerCase().endsWith('.md');
  const run = (view: EditorView, action: EditorAction) => {
    if (action === 'undo') undo(view); else if (action === 'redo') redo(view); else if (action === 'search') openSearchPanel(view);
    else if (action === 'gotoLine') gotoLine(view);
    else {
      const { from, to } = view.state.selection.main;
      if (from === to && ['bold', 'italic', 'underline'].includes(action)) {
        const pending = view.state.field(pendingFormat);
        view.dispatch({ effects: setPendingFormat.of(pending === action ? null : action as InlineAction) });
        view.focus(); return;
      }
      const result = formatSelection(view.state.doc.toString(), from, to, action);
      view.dispatch({ changes: { from: result.from, to: result.to, insert: result.insert }, selection: { anchor: result.anchor, head: result.head }, userEvent: 'input' });
    }
    view.focus();
  };
  const emitPosition = (state: EditorState) => {
    const pos = state.selection.main.head, line = state.doc.lineAt(pos), marks = line.text.match(/^(#{1,3})\s/);
    events.onCursor(line.number, pos - line.from + 1);
    events.onBlock(marks ? ['', 'title', 'subtitle', 'section'][marks[1].length] : 'normal');
  };
  const {mode, wrap, showSpaces} = configuration;
  const extensions = [
    corrections,
    EditorView.inputHandler.of((view, from, to, text) => {
      const action = view.state.field(pendingFormat); if (!action || !text || text.includes('\n')) return false;
      const formatted = formatSelection(text, 0, text.length, action);
      view.dispatch({ changes: { from, to, insert: formatted.insert }, selection: { anchor: from + formatted.head }, effects: setPendingFormat.of(null), userEvent: 'input.type' });
      return true;
    }),
    search({ top: true }), highlightSelectionMatches(), bracketMatching(), indentOnInput(), drawSelection(), rectangularSelection(), EditorState.tabSize.of(4),
    wrapping.of(mode === 'novel' || wrap ? EditorView.lineWrapping : []), spaces.of(showSpaces && mode === 'markdown' ? highlightWhitespace() : []),
    highlighting.of(syntaxHighlighting(mode === 'novel' ? defaultHighlightStyle : technicalHighlight)), language.of(isMarkdown ? markdownSupport : []),
    presentation.of(mode === 'novel' ? (isMarkdown ? novelPresentation : []) : [lineNumbers(), foldGutter(), highlightActiveLine(), highlightActiveLineGutter()]),
    placeholder('Escribe aquí…'),
    keymap.of([
      { key: 'Mod-b', run: (view: EditorView) => { run(view, 'bold'); return true; } },
      { key: 'Mod-i', run: (view: EditorView) => { run(view, 'italic'); return true; } },
      { key: 'Mod-u', run: (view: EditorView) => { run(view, 'underline'); return true; } },
      { key: 'Mod-l', run: gotoLine }, ...searchKeymap, ...foldKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab,
    ]),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        localText = update.state.doc.toString(); events.onEdit(id, localText);
        events.onStats(update.state.field(documentStatistics));
      }
      if (update.selectionSet || update.docChanged) emitPosition(update.state);
    }),
    EditorView.contentAttributes.of({ 'aria-label': 'Texto del documento', spellcheck: 'false' }),
  ];
  const snapshot = snapshots.get(id);
  let state = snapshot && snapshot.text === document.text
    ? snapshot.state.update({ effects: runtime.reconfigure(extensions) }).state
    : EditorState.create({ doc: document.text, extensions: [history(), pendingFormat, documentStatistics, foldState, EditorState.allowMultipleSelections.of(true), runtime.of([])] }).update({ effects: runtime.reconfigure(extensions) }).state;
  if (snapshot && snapshot.text === document.text) state = state.update({ effects: setSearchQuery.of(snapshot.query) }).state;
  const view = new EditorView({ state, parent: host });
  snapshots.delete(id); active.add(id);
  if (snapshot && snapshot.text === document.text) view.scrollDOM.scrollTo(snapshot.scrollLeft, snapshot.scrollTop);
  events.onStats(state.field(documentStatistics)); emitPosition(state);
  if (snapshot?.searchOpen && snapshot.text === document.text) {
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(snapshot.query) });
  }
  view.focus();
  return {
    action: action => run(view, action),
    correctSelection: () => correctSelectedWord(view),
    corrections: issues => {
      if (!suspended) view.dispatch({ effects: setCorrections.of(issues.filter(issue => issue.from >= 0 && issue.to > issue.from && issue.to <= view.state.doc.length && view.state.sliceDoc(issue.from, issue.to) === issue.word)) });
    },
    replace: (from, to, expected, insert) => {
      if (suspended || from < 0 || to > view.state.doc.length || view.state.sliceDoc(from, to) !== expected) return false;
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' });
      view.focus(); return true;
    },
    updateEvents: next => { events = next; },
    updateDocument: next => {
      if (!suspended && localText !== next.text) {
        localText = next.text;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next.text } });
      }
    },
    configure: (next, nextTitle) => {
      if (suspended || next.mode === settings.mode && next.wrap === settings.wrap && next.showSpaces === settings.showSpaces && nextTitle === title) return;
      const nextMarkdown = nextTitle.toLowerCase().endsWith('.md');
      const effects = [];
      if (next.mode !== settings.mode || nextMarkdown !== isMarkdown) {
        effects.push(presentation.reconfigure(next.mode === 'novel' ? (nextMarkdown ? novelPresentation : []) : [lineNumbers(), foldGutter(), highlightActiveLine(), highlightActiveLineGutter()]));
      }
      if (nextMarkdown !== isMarkdown) effects.push(language.reconfigure(nextMarkdown ? markdownSupport : []));
      if (next.mode !== settings.mode || next.wrap !== settings.wrap) effects.push(wrapping.reconfigure(next.mode === 'novel' || next.wrap ? EditorView.lineWrapping : []));
      if (next.mode !== settings.mode || next.showSpaces !== settings.showSpaces) effects.push(spaces.reconfigure(next.showSpaces && next.mode === 'markdown' ? highlightWhitespace() : []));
      if (next.mode !== settings.mode) effects.push(highlighting.reconfigure(syntaxHighlighting(next.mode === 'novel' ? defaultHighlightStyle : technicalHighlight)));
      settings = next; title = nextTitle; isMarkdown = nextMarkdown;
      if (effects.length) view.dispatch({ effects });
    },
    getText: () => localText,
    getSelection: () => ({ ranges: view.state.selection.ranges.map(({anchor, head}) => ({anchor, head})), mainIndex: view.state.selection.mainIndex }),
    setSelection: next => {
      if (!suspended) view.dispatch({ selection: CMSelection.create(next.ranges.map(({anchor, head}) => CMSelection.range(anchor, head)), next.mainIndex) });
    },
    suspend: () => {
      if (suspended) return;
      suspended = true;
      const scrollTop = view.scrollDOM.scrollTop, scrollLeft = view.scrollDOM.scrollLeft;
      // Reconfiguration drops parser state, diagnostic decorations and callback closures.
      const retained = view.state.update({ effects: runtime.reconfigure([]) }).state;
      if (!retired.has(id)) snapshots.set(id, { state: retained, text: localText, scrollTop, scrollLeft, query: getSearchQuery(view.state), searchOpen: searchPanelOpen(view.state) });
      active.delete(id); retired.delete(id); events = quiet; view.destroy();
    },
  };
}
export const codeMirrorEngine: EditorEngine = {
  name: 'codemirror', mount,
  forget(id) { snapshots.delete(id); if (active.has(id)) retired.add(id); },
  retainedCount: () => snapshots.size,
};
registerEditorEngine(codeMirrorEngine);
