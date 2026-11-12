export interface Issue { from: number; to: number; word: string; message: string; suggestions: string[]; kind: 'grammar' | 'spelling' }
export interface SpellResult { language: string | null; issues: Omit<Issue, 'kind' | 'message'>[]; warning: string | null }
// Windows spelling uses UTF-16 offsets. A sample must not split an emoji's
// surrogate pair at the automatic-review boundary.
export function reviewSample(text: string, limit = 100000) {
  let end = Math.min(text.length, limit);
  if (end > 0 && end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--;
  return text.slice(0, end);
}
// Keep UTF-16 positions identical to CodeMirror while excluding code and destinations.
export function reviewText(text: string) {
  return text.replace(/```[^]*?```|~~~[^]*?~~~|`[^`\n]*`|https?:\/\/[^\s)]+/g, match => match.replace(/[^\n\r]/g, ' '));
}
export function grammar(text: string): Issue[] {
  const source = reviewText(text); const issues: Issue[] = [];
  const scan = (pattern: RegExp, message: string, replacement: (match: RegExpExecArray) => string) => {
    for (const match of source.matchAll(pattern)) {
      // Masking preserves positions but must never turn excluded code into
      // whitespace that a grammar rule could consume and replace.
      if (text.slice(match.index!, match.index! + match[0].length) !== match[0]) continue;
      issues.push({ from: match.index!, to: match.index! + match[0].length, word: text.slice(match.index!, match.index! + match[0].length), message, suggestions: [replacement(match)], kind: 'grammar' });
      if (issues.length >= 100) break;
    }
  };
  scan(/(?<![\p{L}\p{N}])([\p{L}]+)([ \t]+)\1(?![\p{L}\p{N}])/giu, 'Palabra repetida: revisa si es intencional.', m => m[1]);
  scan(/\S[ \t]+[,.;:!?]/gu, 'Espacio antes de un signo de puntuación.', m => m[0].replace(/[ \t]+/, ''));
  scan(/\b(de)[ \t]+el\b/giu, 'Posible contracción «del»; revisa nombres propios.', m => m[1][0] === 'D' ? 'Del' : 'del');
  scan(/\b(a)[ \t]+el\b/giu, 'Posible contracción «al»; revisa nombres propios.', m => m[1] === 'A' ? 'Al' : 'al');
  return issues.sort((a, b) => a.from - b.from).slice(0, 100);
}
