export interface Format { encoding: string; eol: string }
export interface Document {
  id: string; path: string | null; title: string; text: string; baseText: string;
  diskHash: string | null; format: Format; recovered: boolean;
  note?: string;
  metadataPending?: boolean;
  noteReadFailed?: boolean;
  noteRevision?: number;
  noteId?: string;
}
export interface SaveOutcome { document: Document; warnings: string[] }
export interface Tab extends Document { external: boolean; notePending?: boolean; revision?: number; recovery: 'pending' | 'saved' | 'error' | 'none' }
export interface Recent { path: string; title: string }
export interface Entry { path: string; title: string; directory: boolean }
export interface Folder { path: string; entries: Entry[] }
export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export const dirty = (doc: Document) => doc.text !== doc.baseText;

export function count(text: string) {
  let words = 0, characters = 0, inWord = false;
  for (let offset = 0; offset < text.length;) {
    const point = text.codePointAt(offset)!;
    offset += point > 0xffff ? 2 : 1;
    characters++;
    if (isWordPoint(point)) {
      if (!inWord) words++;
      inWord = true;
    } else {
      inWord = (point === 39 || point === 45 || point === 8217) && inWord && offset < text.length && isWordPoint(text.codePointAt(offset)!);
    }
  }
  return { words, characters };
}
const nonAsciiWord = /[\p{L}\p{N}]/u;
function isWordPoint(point: number) {
  return point >= 48 && point <= 57 || point >= 65 && point <= 90 || point >= 97 && point <= 122 || point > 127 && nonAsciiWord.test(String.fromCodePoint(point));
}
