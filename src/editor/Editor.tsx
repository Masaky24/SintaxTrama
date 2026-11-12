import { useEffect, useRef, type MutableRefObject } from 'react';
import { codeMirrorEngine } from './CodeMirrorAdapter';
import type { EditorDocument, EditorEngine, EditorEvents, EditorHandle, EditorSession } from './engine';
export type { EditorHandle } from './engine';

export function Editor({ doc, mode, indent, wrap, showSpaces, handle, onEdit, onCursor, onBlock, onStats, engine = codeMirrorEngine }: {
  doc: EditorDocument; mode: 'markdown' | 'novel'; indent: boolean; wrap: boolean; showSpaces: boolean;
  handle: MutableRefObject<EditorHandle | null>; engine?: EditorEngine;
} & EditorEvents) {
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<EditorSession | null>(null);
  const events = { onEdit, onCursor, onBlock, onStats };
  // Refresh callbacks without retaining React props or inactive tab documents in engine snapshots.
  session.current?.updateEvents(events);
  useEffect(() => {
    const mounted = engine.mount(host.current!, doc, { mode, wrap, showSpaces }, events);
    session.current = mounted; handle.current = mounted;
    return () => { mounted.suspend(); session.current = null; handle.current = null; };
  }, [doc.id, engine]);
  useEffect(() => { session.current?.updateDocument(doc); }, [doc.text]);
  useEffect(() => { session.current?.configure({ mode, wrap, showSpaces }, doc.title); }, [mode, wrap, showSpaces, doc.title]);
  return <div className={`editor-host ${mode} ${indent && mode === 'novel' ? 'indent' : ''}`} ref={host} />;
}
