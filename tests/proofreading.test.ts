import { describe, expect, it } from 'vitest';
import { grammar, reviewSample, reviewText } from '../src/domain/proofreading';
describe('local Spanish proofreading', () => {
  it('samples at most 100,000 UTF-16 units without splitting surrogate pairs', () => {
    const text = 'a'.repeat(99999) + '😀 fin';
    expect(reviewSample(text)).toBe('a'.repeat(99999));
    expect(reviewSample('a'.repeat(99998) + '😀 fin')).toHaveLength(100000);
    expect(reviewSample('😀')).toBe('😀');
    expect(reviewSample('a'.repeat(100000))).toHaveLength(100000);
  });
  it('never proposes replacing code or URLs masked as spaces', () => {
    expect(grammar('Escribe `ruta/local`.')).toEqual([]);
    expect(grammar('Visita https://example.test/ruta , mañana.')).toEqual([]);
    expect(grammar('uno `código` uno')).toEqual([]);
  });
  it('keeps UTF-16 positions through emojis, accents, code and URLs', () => {
    const text = '😀 `palabra palabra` https://example.test/ruta\nárbol árbol';
    const masked = reviewText(text); expect(masked.length).toBe(text.length);
    const issues = grammar(text); expect(issues).toHaveLength(1); expect(issues[0].word).toBe('árbol árbol'); expect(text.slice(issues[0].from, issues[0].to)).toBe('árbol árbol');
  });
  it('suggests basic contractions and punctuation without changing the source', () => {
    const text = 'Voy a el parque de el barrio , mañana.';
    expect(grammar(text).map(issue => issue.suggestions[0])).toEqual(['al', 'del', 'o,']); expect(text).toContain('a el');
  });
  it('ignores fenced code and caps suggestions', () => { expect(grammar('```\nuno uno\n```')).toHaveLength(0); expect(grammar('uno uno. '.repeat(400))).toHaveLength(100); });
});
