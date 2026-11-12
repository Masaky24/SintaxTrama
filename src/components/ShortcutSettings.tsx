import { useState } from 'react';
import { defaultShortcuts, keySignature, shortcutDefinitions, shortcutError, shortcutLabel, type Shortcuts } from '../domain/shortcuts';

export function ShortcutSettings({ shortcuts, onChange }: { shortcuts: Shortcuts; onChange: (value: Shortcuts) => void }) {
  const [error, setError] = useState<string | null>(null);
  return <div className="shortcut-settings"><p>Seleccione un campo y pulse la combinación nueva. Retroceso la desactiva. Los cambios se guardan en este equipo.</p>
    {error && <p role="alert" className="small-error">{error}</p>}
    <button className="wide-button" onClick={() => { onChange({ ...defaultShortcuts }); setError(null); }}>Restablecer todos los atajos</button>
    {shortcutDefinitions.map(([action, label]) => <div className="shortcut-row" key={action}><label htmlFor={`shortcut-${action}`}>{label}</label><input id={`shortcut-${action}`} data-shortcut-input aria-label={`Atajo de ${label}`} readOnly value={shortcutLabel(shortcuts[action])} onFocus={event => event.currentTarget.select()} onKeyDown={event => {
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) return;
      event.preventDefault(); event.stopPropagation();
      if (event.metaKey) { setError('La tecla Windows no está disponible para atajos del editor.'); return; }
      if (event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.shiftKey) { onChange({ ...shortcuts, [action]: '' }); setError(null); return; }
      const signature = keySignature(event.nativeEvent); if (!signature) return;
      const problem = shortcutError(action, signature, shortcuts);
      if (problem) setError(problem); else { onChange({ ...shortcuts, [action]: signature }); setError(null); }
    }}/><button title={`Restablecer ${label}`} aria-label={`Restablecer atajo de ${label}`} onClick={() => {
      const problem = shortcutError(action, defaultShortcuts[action], shortcuts);
      if (problem) setError(problem); else { onChange({ ...shortcuts, [action]: defaultShortcuts[action] }); setError(null); }
    }}>↺</button></div>)}
  </div>;
}
