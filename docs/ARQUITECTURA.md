# Arquitectura de SintaxTrama 0.1.6

## Límites de responsabilidad

React organiza ventanas, explorador, pestañas y preferencias. `domain/workspace.ts` conserva documentos y serializa persistencia/cierre/autoguardado. `platform/bridge.ts` usa invoke solo en Tauri; un navegador sin puente no simula guardados.

`editor/engine.ts` define EditorEngine, EditorSession, configuración, selección y eventos sin tipos de CodeMirror. `Editor.tsx` es el host React; `CodeMirrorAdapter.ts` implementa el motor actual. Persistencia y propiedad del documento permanecen fuera del adaptador. El contrato admite otro motor futuro sin implementar Milkdown.

Los comandos Tauri están en `src-tauri/src/main.rs`: diálogos rfd, instancia única y tareas bloqueantes serializadas por Mutex<Workspace>. `src-tauri/core` contiene formato, almacenamiento, notas, recuperación, raíces y exportación. `writing_tools.rs` implementa DirectWrite y COM SpellChecker, sin enviar texto a servidores.

## Pestañas y memoria

Hay una vista activa. Suspender conserva un estado reducido con documento, selecciones múltiples, undo/redo, plegados, formato pendiente y contadores; elimina runtime, parser, DOM, diagnósticos y callbacks. Consulta de búsqueda/opciones y desplazamiento se guardan aparte. Al reabrir se reinstalan extensiones y callbacks actuales. Cerrar elimina caché y evita que la limpieza tardía de React la resucite.

El contador Unicode es incremental por transacción. Cursor o cambios sin contenido no lo recalculan; Workspace omite notificaciones idénticas. El texto completo todavía se sincroniza con el store y se serializa en recuperación. El historial de una pestaña abierta se conserva, por lo que no existe un presupuesto global de RAM.

## Identidad, notas y migración

`id` identifica la sesión de edición; `noteId` es el UUID persistente. `note-identities.json` versión 1 asocia UUID, ruta, identidad física y huella. En Windows se usa volumen + índice de archivo. Al renombrar o abrir un alias se reutiliza la sesión por UUID y se actualiza su ruta sin reemplazar texto pendiente, selección o historial. Una recuperación pendiente también recibe la nueva ruta.

Las notas usan `{version:1, revision, text}` en `notes/<uuid>.json`. Se leen los JSON/TXT anteriores por SHA de ruta cuando aún no existe registro UUID. La migración conserva esos originales. Un traslado entre volúmenes solo puede inferirse con una coincidencia de contenido única y una ruta previa realmente ausente; ante ambigüedad no se adivina.

Guardar el cuerpo reconcilia la revisión de nota persistida: nunca debe rebajar una nota más reciente. Si la nota no puede verificarse, se conserva sin reemplazar y el guardado del cuerpo informa metadatos pendientes; una nota ya marcada como ilegible requiere resolver su lectura antes del reemplazo. Guardar como bifurca la asociación para no modificar la nota del origen.

## Escritura y recuperación

Formato interno LF; UTF-8/BOM y UTF-16 con BOM se validan sin reemplazos destructivos. Formatos no reconocidos se rechazan. Saltos mixtos requieren copia y confirmación. `storage.rs` limita lecturas, compara SHA-256, sincroniza un temporal en el mismo volumen y utiliza ReplaceFileW en Windows. No se trunca el original ni se crean .bak permanentes.

Un temporal desplazado permite verificar la versión reemplazada. En éxito normal se elimina; si hubo carrera o no puede verificarse, se conserva y se informa su ruta. Una versión externa potencialmente única no se borra automáticamente. Para un nombre nuevo se usa creación sin reemplazo.

Recuperación: `<id>.json`, `<id>.slot1`, `<id>.slot2`. Se valida cada generación antes de reutilizarla y se confirma la nueva actual antes de rotar. Checkpoints idénticos no destruyen versiones distintas. La restauración prefiere actual y cae a generaciones válidas, conservando registros ilegibles. Recargar archiva el documento validado en hasta tres slots `.reload1..3` por identidad; no se restauran como pendientes. Se conservan .bak y .archived anteriores.

La respuesta SaveOutcome separa el manuscrito confirmado de avisos de notas, índice, recientes o limpieza. La ruta/base/huella se actualizan antes de esos metadatos; el reintento no genera un conflicto contra su propio guardado. La UI conserva texto y nota que llegaron durante una operación. El autosave está desactivado inicialmente y omite recuperados, conflictos, documentos sin ruta, saltos mixtos y metadatos pendientes.

## Corrección y exportación

LatestReviewScheduler retiene una llamada activa y un sucesor reemplazable con debounce de 1.200 ms. Cancelar invalida resultados, pero mantiene ocupada la plaza nativa hasta que COM termina. Se validan id/revisión/texto y límites de cada tramo antes de mostrar o sustituir. El muestreo respeta pares sustitutos y limita la revisión a 100.000 unidades UTF-16. La gramática usa cuatro reglas locales, no un analizador lingüístico completo.

La exportación MD→TXT consume eventos de pulldown-cmark 0.13, conserva párrafos, listas, código, tablas tabuladas y etiquetas de enlaces/imágenes. No modifica el origen ni su baseline. TXT→TXT conserva Markdown literal. HTML arbitrario tiene soporte limitado y nunca se ejecuta.

## Windows, instalación y seguridad

CSP local/IPC, sin shell ni filesystem genérico expuesto al frontend. Se validan extensión/ruta/límites; el explorador solo opera bajo raíces autorizadas y omite symlinks. Tauri single-instance entrega nuevas rutas a la ventana existente. El código no incorpora telemetría ni credenciales.

La plantilla NSIS está fijada a Tauri CLI 2.12.4 con claves y directorio internos Pliegra, separados del nombre visible SintaxTrama. Detecta la instalación existente y reutiliza su ubicación. Los hooks no cambian UserChoice y solo retiran asociaciones cuyo comando pertenece a su instalación. Revisar esta plantilla al actualizar la CLI.

Se mantienen `local.esteban.linde` y `pliegra.exe`; G9C_Studios figura en copyright/autoría. Datos nativos y preferencias WebView conservan su ubicación. Licencias propias y de terceros se instalan bajo `licenses/`. La licencia del producto es MIT.

Los datos locales no tienen cifrado propio. No se garantiza funcionamiento idéntico en unidades remotas, sincronizadores, ante todos los cortes eléctricos o con un proveedor COM bloqueado. Ver pruebas y límites en los documentos de la entrega.
