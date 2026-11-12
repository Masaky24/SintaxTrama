import type { Action } from './formatting';
import type { Issue } from '../domain/proofreading';

export type EditorAction = Action | 'undo' | 'redo' | 'search' | 'gotoLine';
export interface EditorDocument { id: string; title: string; text: string }
export interface EditorConfiguration { mode: 'markdown' | 'novel'; wrap: boolean; showSpaces: boolean }
export interface EditorSelection { ranges: { anchor: number; head: number }[]; mainIndex: number }
export interface EditorEvents {
  onEdit: (id: string, text: string) => void;
  onCursor: (line: number, column: number) => void;
  onBlock: (type: string) => void;
  onStats: (stats: { words: number; characters: number }) => void;
}
export interface EditorHandle {
  action: (action: EditorAction) => void;
  replace: (from: number, to: number, expected: string, insert: string) => boolean;
  corrections: (issues: Issue[]) => void;
  correctSelection: () => boolean;
}
/** An active editing surface. Persistence and document ownership remain outside the engine. */
export interface EditorSession extends EditorHandle {
  updateDocument: (document: EditorDocument) => void;
  configure: (configuration: EditorConfiguration, title: string) => void;
  updateEvents: (events: EditorEvents) => void;
  getText: () => string;
  getSelection: () => EditorSelection;
  setSelection: (selection: EditorSelection) => void;
  suspend: () => void;
}
/** Engine boundary for the current adapter and future engines; no engine state crosses it. */
export interface EditorEngine {
  readonly name: string;
  mount: (host: HTMLElement, document: EditorDocument, configuration: EditorConfiguration, events: EditorEvents) => EditorSession;
  forget: (id: string) => void;
  retainedCount: () => number;
}
