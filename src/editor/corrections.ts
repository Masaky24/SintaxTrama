import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { Issue } from '../domain/proofreading';

export const setCorrections = StateEffect.define<Issue[]>();
export const corrections = StateField.define<Issue[]>({
  create: () => [],
  update(value, transaction) {
    if (transaction.docChanged) return [];
    for (const effect of transaction.effects) if (effect.is(setCorrections)) return effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field, issues => Decoration.set(issues.filter(issue => issue.kind === 'spelling').map(issue => Decoration.mark({ class: 'spelling-error', attributes: { title: issue.suggestions[0] ? `Sugerencia: ${issue.suggestions[0]}` : issue.message } }).range(issue.from, issue.to)), true)),
});
export function correctSelectedWord(view: EditorView) {
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  const issue = view.state.field(corrections).find(issue => issue.kind === 'spelling' && issue.from === from && issue.to === to && issue.suggestions.length);
  if (!issue || view.state.sliceDoc(from, to) !== issue.word) return false;
  const insert = issue.suggestions[0];
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.complete' });
  return true;
}
