import { useEffect, useRef, useState } from 'react';
import { grammar, reviewSample, reviewText, type Issue, type SpellResult } from '../domain/proofreading';
import { reviewScheduler, sameReviewRevision, type ReviewJob, type ReviewSnapshot } from '../domain/reviewScheduler';
import type { Invoke, Tab } from '../domain/types';
import type { EditorHandle } from '../editor/engine';

export function Proofreading({ doc, invoke, editor, ignored, onIgnore, correctionKey = 'Tab', undoKey = 'Ctrl+Z' }: { doc: Tab; invoke: Invoke; editor: React.RefObject<EditorHandle | null>; ignored: string[]; onIgnore: (word: string) => void; correctionKey?: string; undoKey?: string }) {
  const [result, setResult] = useState<{ snapshot: ReviewSnapshot; issues: Issue[]; warning: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<ReviewSnapshot>({ documentId: doc.id, text: doc.text, revision: doc.revision ?? 0 });
  // Invalidate immediately on render, before a previous native promise can
  // settle between the new render and its effect cleanup (including A→B→A).
  if (current.current.documentId !== doc.id || current.current.text !== doc.text || doc.revision !== undefined && current.current.revision !== doc.revision) {
    current.current = { documentId: doc.id, text: doc.text, revision: doc.revision ?? current.current.revision + 1 };
  }
  const job = useRef<ReviewJob<{ issues: Issue[]; warning: string | null }> | null>(null);
  useEffect(() => () => { job.current?.cancel(); job.current = null; }, []);
  useEffect(() => {
    job.current?.cancel();
    setBusy(false);
    setResult(null);
    editor.current?.corrections([]);
    if (doc.text.length > 100000) return;
    review(1200);
    return () => { job.current?.cancel(); job.current = null; };
  }, [doc.id, doc.text, doc.revision, invoke]);
  useEffect(() => {
    editor.current?.corrections(result && sameReviewRevision(result.snapshot, current.current) ? result.issues.filter(issue => !ignored.includes(issue.word.toLocaleLowerCase('es'))) : []);
  }, [result, ignored, doc.id, doc.text, doc.revision, editor]);
  function review(delay = 0) {
    job.current?.cancel();
    const snapshot = current.current;
    if (delay === 0) setBusy(true);
    const scheduled = reviewScheduler.schedule(async () => {
      if (sameReviewRevision(snapshot, current.current)) setBusy(true);
      const sample = reviewSample(snapshot.text);
      let issues = grammar(sample);
      let warning: string | null = snapshot.text.length > sample.length ? 'Se revisaron los primeros 100.000 caracteres. Divida el texto para revisar el resto.' : null;
      try {
        const checked = await invoke<SpellResult>('spell_check', { text: reviewText(sample) });
        if (!checked) throw new Error('La ortografía nativa requiere la aplicación de Windows.');
        const spelling = checked.issues.filter(issue => issue.from >= 0 && issue.to > issue.from && issue.to <= sample.length && sample.slice(issue.from, issue.to) === issue.word);
        issues = [...issues, ...spelling.map(issue => ({ ...issue, message: 'Posible error ortográfico', kind: 'spelling' as const }))].sort((a, b) => a.from - b.from);
        warning = [warning, checked.warning].filter(Boolean).join(' ') || null;
      } catch (error) { warning = [warning, String(error)].filter(Boolean).join(' '); }
      return { issues, warning };
    }, delay);
    job.current = scheduled;
    void scheduled.result.then(outcome => {
      if (outcome.status === 'completed' && job.current === scheduled && sameReviewRevision(snapshot, current.current)) {
        setResult({ snapshot, ...outcome.value });
        setBusy(false);
      }
    }, error => {
      if (job.current === scheduled && sameReviewRevision(snapshot, current.current)) {
        setResult({ snapshot, issues: [], warning: String(error) });
        setBusy(false);
      }
    });
  }
  const currentResult = result && sameReviewRevision(result.snapshot, current.current) ? result : null;
  return <section className="proofreading"><h2>CORRECCIÓN</h2><button className="wide-button" disabled={busy} onClick={() => void review()}>{busy ? 'Revisando…' : 'Revisar texto'}</button>
    <p className="panel-hint">{correctionKey === 'Sin asignar' ? 'Seleccione una sugerencia para aplicarla.' : `Seleccione una palabra subrayada y pulse ${correctionKey} para aplicar la primera sugerencia.`} {undoKey === 'Sin asignar' ? 'El botón Deshacer revierte el cambio.' : `${undoKey} deshace el cambio.`}</p>
    {doc.text.length > 100000 && <p className="panel-hint">Revisión automática pausada por tamaño. «Revisar texto» comprueba los primeros 100.000 caracteres.</p>}
    {currentResult && <><p className="panel-hint">Reglas básicas y ortografía de Windows. Las sugerencias requieren revisión.</p>
      {currentResult.warning && <p role="status" className="panel-hint">{currentResult.warning}</p>}
      {!currentResult.issues.length && <p className="panel-hint">No se encontraron sugerencias en el tramo revisado.</p>}
      {currentResult.issues.filter(issue => !ignored.includes(issue.word.toLocaleLowerCase('es'))).slice(0, 40).map((issue, index) => <div className="correction" key={`${issue.from}-${index}`}><strong>{issue.word}</strong><p>{issue.message}</p><div>{issue.suggestions.map(value => <button key={value} onClick={() => { if (sameReviewRevision(currentResult.snapshot, current.current) && editor.current?.replace(issue.from, issue.to, issue.word, value)) setResult(null); }}>{value || 'Eliminar'}</button>)}<button title="Aceptar este nombre o palabra en este equipo" onClick={() => onIgnore(issue.word)}>Ignorar</button></div></div>)}
    </>}
  </section>;
}
