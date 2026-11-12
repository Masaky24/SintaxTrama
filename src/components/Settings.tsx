import { useEffect, useRef, useState } from 'react';
import { ShortcutSettings } from './ShortcutSettings';
import type { Shortcuts } from '../domain/shortcuts';

export function Settings({ onClose, theme, setTheme, autosave, setAutosave, showSpaces, setShowSpaces, ignored, clearIgnored, proofreading, setProofreading, shortcuts, setShortcuts }: {
  onClose: () => void; theme: string; setTheme: (v: string) => void; autosave: number; setAutosave: (v: number) => void;
  showSpaces: boolean; setShowSpaces: (v: boolean) => void; ignored: number; clearIgnored: () => void;
  proofreading: boolean; setProofreading: (v: boolean) => void;
  shortcuts: Shortcuts; setShortcuts: (v: Shortcuts) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null); const [section, setSection] = useState('General');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-heading" onCancel={onClose} onClose={onClose}>
    <header><h1 id="settings-heading">Configuración</h1><button aria-label="Cerrar configuración" onClick={onClose}>×</button></header>
    <div className="settings-body"><nav aria-label="Secciones de configuración">{['General', 'Editor', 'Corrección', 'Atajos'].map(name => <button key={name} aria-pressed={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav><div className="settings-fields">
      {section === 'General' && <><label>Tema<select aria-label="Tema" value={theme} onChange={e => setTheme(e.target.value)}><option value="dark">Oscuro</option><option value="light">Claro</option></select></label>
        <label>Guardado automático<select aria-label="Guardado automático" value={autosave} onChange={e => setAutosave(Number(e.target.value))}>{[[0, 'Desactivado'], [15, 'Cada 15 segundos'], [30, 'Cada 30 segundos'], [60, 'Cada 60 segundos'], [120, 'Cada 2 minutos'], [300, 'Cada 5 minutos']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p>Solo archivos con nombre, sin conflictos y con saltos de línea uniformes. Los documentos recuperados requieren guardado manual.</p><p>La copia de recuperación permanece activa aunque desactive el guardado automático.</p><p>Las carpetas elegidas se recuerdan al iniciar. Cerrarlas en el explorador no borra archivos.</p></>}
      {section === 'Editor' && <><label><span>Mostrar espacios en Markdown</span><input type="checkbox" checked={showSpaces} onChange={e => setShowSpaces(e.target.checked)}/></label><p>La fuente y los tamaños de texto y títulos se ajustan en el panel derecho, de forma independiente. Estos cambios afectan la lectura; no reescriben el archivo.</p></>}
      {section === 'Corrección' && <><label>Revisión local en español<input type="checkbox" checked={proofreading} onChange={e => setProofreading(e.target.checked)}/></label><p>Ortografía de Windows y reglas básicas de gramática y puntuación. Revisa al pausar la escritura y permite solicitar una revisión manual. Seleccionar una palabra subrayada y pulsar Tab acepta la primera sugerencia; Ctrl+Z deshace el cambio.</p><p>Los nombres aceptados se guardan solo en SintaxTrama: {ignored}.</p><button onClick={clearIgnored} disabled={!ignored}>Restablecer palabras ignoradas</button><p>Sin cuentas, telemetría ni envío de manuscritos a Internet.</p></>}
      {section === 'Atajos' && <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts}/>}
    </div></div><footer><button onClick={onClose}>Listo</button></footer>
  </dialog>;
}
