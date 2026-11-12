import type { EditorEngine } from './engine';
const engines = new Set<EditorEngine>();
export function registerEditorEngine(engine: EditorEngine) { engines.add(engine); }
export function forgetEditor(id: string) { for (const engine of engines) engine.forget(id); }
export function retainedEditorCount() { return [...engines].reduce((sum, engine) => sum + engine.retainedCount(), 0); }
