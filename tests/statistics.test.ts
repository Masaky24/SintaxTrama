import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { count } from '../src/domain/types';
import { documentStatistics } from '../src/editor/statistics';

const reference = (text: string) => ({ words: (text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length, characters: Array.from(text).length });
let seed = 7239;
function random(limit: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % Math.max(1, limit); }
const alphabet = ['a', 'Z', ' ', '\n', '-', "'", '’', 'í', '中', '𐐀', '😀', '½', '\u0301', '\ud800', '\udc00', '*', '<u>', '\t'];
function fragment() { let text = ''; for (let n = random(12); n > 0; n--) text += alphabet[random(alphabet.length)]; return text; }

describe('counter behavior preservation', () => {
  it('matches the original Unicode definition across generated text', () => {
    for (let n=0; n<1500; n++) { const text = fragment()+fragment()+fragment(); expect(count(text)).toEqual(reference(text)); }
  });
  it('updates exactly across edits, newlines and surrogate boundaries', () => {
    let state = EditorState.create({ doc: "Un capítulo 😀\n𐐀-árbol y l'amour\n", extensions: [documentStatistics] });
    for (let n=0; n<1000; n++) {
      const from = random(state.doc.length+1), to = Math.min(state.doc.length, from+random(10));
      state = state.update({ changes: { from, to, insert: fragment() } }).state;
      expect(state.field(documentStatistics)).toEqual(reference(state.doc.toString()));
    }
  });
  it('merges neighboring simultaneous edits without double counting', () => {
    let state = EditorState.create({ doc: 'a'.repeat(100)+'\n'+"b-c'd ".repeat(20), extensions: [documentStatistics] });
    for (let n=0; n<400; n++) {
      if (state.doc.length<10) state = state.update({ changes: { from: 0, insert: 'abcdef\n'.repeat(10) } }).state;
      const first=random(Math.floor(state.doc.length/2)-2), second=first+3+random(state.doc.length-first-3);
      state = state.update({ changes: [{ from:first,to:first+random(3),insert:fragment() }, { from:second,to:Math.min(state.doc.length,second+random(3)),insert:fragment() }] }).state;
      expect(state.field(documentStatistics)).toEqual(reference(state.doc.toString()));
    }
  });
  it('keeps cached statistics on cursor-only changes', () => {
    const state = EditorState.create({ doc: 'Una novela', extensions: [documentStatistics] });
    expect(state.update({ selection: { anchor: 4 } }).state.field(documentStatistics)).toBe(state.field(documentStatistics));
  });
});
