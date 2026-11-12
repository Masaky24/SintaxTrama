import { StateField, type Text } from '@codemirror/state';
import { count } from '../domain/types.ts';

type Range = { oldFrom: number; oldTo: number; newFrom: number; newTo: number };
function context(doc: Text, from: number, to: number) {
  // Word starts depend on at most two previous code points. Four UTF-16
  // units on either side include that context, including supplementary letters.
  from = Math.max(0, from - 4); to = Math.min(doc.length, to + 4);
  const low = (c: number) => c >= 0xdc00 && c <= 0xdfff;
  const high = (c: number) => c >= 0xd800 && c <= 0xdbff;
  if (from > 0 && low(doc.sliceString(from, from + 1).charCodeAt(0)) && high(doc.sliceString(from - 1, from).charCodeAt(0))) from--;
  if (to < doc.length && high(doc.sliceString(to - 1, to).charCodeAt(0)) && low(doc.sliceString(to, to + 1).charCodeAt(0))) to++;
  return { from, to };
}

export const documentStatistics = StateField.define<ReturnType<typeof count>>({
  create: state => count(state.doc.toString()),
  update(value, transaction) {
    if (!transaction.docChanged) return value;
    const ranges: Range[] = [];
    transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
      const old = context(transaction.startState.doc, fromA, toA);
      const next = context(transaction.newDoc, fromB, toB);
      const previous = ranges.at(-1);
      if (previous && (old.from <= previous.oldTo || next.from <= previous.newTo)) {
        previous.oldTo = Math.max(previous.oldTo, old.to); previous.newTo = Math.max(previous.newTo, next.to);
      } else ranges.push({ oldFrom: old.from, oldTo: old.to, newFrom: next.from, newTo: next.to });
    });
    let { words, characters } = value;
    for (const range of ranges) {
      const old = count(transaction.startState.doc.sliceString(range.oldFrom, range.oldTo));
      const next = count(transaction.newDoc.sliceString(range.newFrom, range.newTo));
      words += next.words - old.words; characters += next.characters - old.characters;
    }
    return { words, characters };
  },
});
