#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use editor_md_core::{Document, Entry, Recent, Workspace, SaveOutcome, target_hash};
use serde::Serialize;
use std::{path::PathBuf, sync::{Arc, Mutex}};
use tauri::{Emitter, Manager, State};
mod writing_tools;

type Shared = Arc<Mutex<Workspace>>;
struct Pending(Arc<Mutex<Vec<PathBuf>>>);
struct StartupWarning(Mutex<Option<String>>);

fn cli_paths(args: Vec<String>, cwd: &str) -> Vec<PathBuf> {
    args.into_iter().skip(1).filter_map(|arg| {
        let path = PathBuf::from(arg);
        let supported = path.extension().and_then(|s| s.to_str()).map(|s| matches!(s.to_lowercase().as_str(), "md" | "txt")).unwrap_or(false);
        supported.then(|| if path.is_absolute() { path } else { PathBuf::from(cwd).join(path) })
    }).collect()
}

#[derive(Serialize)]
struct Opened { documents: Vec<Document>, warning: Option<String> }

fn drain_pending(w: &mut Workspace, pending: &Arc<Mutex<Vec<PathBuf>>>) -> Result<Opened, String> {
    let paths = std::mem::take(&mut *pending.lock().map_err(|_| "No se pudo leer la cola de archivos")?);
    let mut documents = Vec::new(); let mut errors = Vec::new();
    for path in paths { match w.open(&path) { Ok(doc) => documents.push(doc), Err(e) => errors.push(e) } }
    Ok(Opened { documents, warning: if errors.is_empty() { None } else { Some(errors.join("\n")) } })
}

async fn task<T: Send + 'static>(state: &State<'_, Shared>, action: impl FnOnce(&mut Workspace) -> Result<T, String> + Send + 'static) -> Result<T, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut workspace = state.lock().map_err(|_| "El motor de archivos no está disponible")?;
        action(&mut workspace)
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct Bootstrap { documents: Vec<Document>, recents: Vec<Recent>, folders: Vec<Folder>, warning: Option<String> }

#[tauri::command]
async fn bootstrap(state: State<'_, Shared>, pending: State<'_, Pending>, startup: State<'_, StartupWarning>) -> Result<Bootstrap, String> {
    let pending = pending.0.clone();
    let startup = startup.0.lock().map_err(|_| "Error de inicio")?.take();
    task(&state, move |w| {
        let opened = drain_pending(w, &pending)?;
        let warning = match (startup, opened.warning) { (Some(a), Some(b)) => Some(format!("{a}\n{b}")), (a, b) => a.or(b) };
        let folders = w.folders().into_iter().map(|path| Folder { entries: Vec::new(), path }).collect();
        Ok(Bootstrap { documents: w.documents.values().cloned().collect(), recents: w.recents.clone(), folders, warning })
    }).await
}
#[tauri::command]
async fn open_pending(state: State<'_, Shared>, pending: State<'_, Pending>) -> Result<Opened, String> {
    let pending = pending.0.clone(); task(&state, move |w| drain_pending(w, &pending)).await
}
#[tauri::command]
async fn new_document(state: State<'_, Shared>) -> Result<Document, String> { task(&state, |w| Ok(w.create())).await }
#[tauri::command]
async fn open_document(state: State<'_, Shared>) -> Result<Option<Document>, String> {
    task(&state, |w| {
        match rfd::FileDialog::new().add_filter("Markdown y texto", &["md", "txt"]).pick_file() {
            Some(path) => w.open(&path).map(Some), None => Ok(None),
        }
    }).await
}
#[tauri::command]
async fn open_path(state: State<'_, Shared>, path: PathBuf) -> Result<Document, String> { task(&state, move |w| w.open_authorized(&path)).await }
#[derive(Serialize)]
struct Folder { path: PathBuf, entries: Vec<Entry> }
#[tauri::command]
async fn open_folder(state: State<'_, Shared>) -> Result<Option<Folder>, String> {
    task(&state, |w| match rfd::FileDialog::new().pick_folder() {
        Some(path) => { let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?; Ok(Some(Folder { entries: w.set_root(path.clone())?, path })) }, None => Ok(None),
    }).await
}
#[tauri::command]
async fn list_folder(state: State<'_, Shared>, path: PathBuf) -> Result<Vec<Entry>, String> { task(&state, move |w| w.list(&path)).await }
#[tauri::command]
async fn remove_folder(state: State<'_, Shared>, path: PathBuf) -> Result<(), String> { task(&state, move |w| w.remove_root(&path)).await }
#[tauri::command]
async fn save_note(state: State<'_, Shared>, id: String, note: String) -> Result<(), String> { task(&state, move |w| w.save_note(&id, note)).await }
#[tauri::command]
async fn system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(writing_tools::fonts).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn spell_check(text: String) -> Result<writing_tools::SpellResult, String> {
    tauri::async_runtime::spawn_blocking(move || writing_tools::spell(&text)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_document(state: State<'_, Shared>, id: String, text: String, save_as: bool) -> Result<Option<SaveOutcome>, String> {
    task(&state, move |w| {
        let doc = w.documents.get(&id).ok_or("Documento cerrado")?.clone();
        if save_as || doc.path.is_none() {
            let mut dialog = rfd::FileDialog::new().add_filter("Markdown", &["md"]).add_filter("Texto plano", &["txt"]).set_file_name(&doc.title);
            if let Some(parent) = doc.path.as_ref().and_then(|p| p.parent()) { dialog = dialog.set_directory(parent); }
            let Some(mut path) = dialog.save_file() else { return Ok(None) };
            if path.extension().is_none() { path.set_extension("md"); }
            let expected = target_hash(&path)?;
            if expected.is_some() || doc.format.eol == "Mixto" {
                let message = if doc.format.eol == "Mixto" { "La copia usará saltos de línea LF. Si el destino existe se reemplazará mediante escritura temporal segura, sin generar archivos .bak. ¿Continuar?" } else { "El destino ya existe. Se reemplazará mediante escritura temporal segura, sin generar archivos .bak. ¿Continuar?" };
                if rfd::MessageDialog::new().set_title("Guardar como").set_description(message).set_buttons(rfd::MessageButtons::YesNo).show() != rfd::MessageDialogResult::Yes { return Ok(None); }
            }
            w.save(&id, text, Some(path), expected).map(Some)
        } else { w.save(&id, text, None, None).map(Some) }
    }).await
}
#[tauri::command]
async fn export_document(state: State<'_, Shared>, id: String, text: String) -> Result<Option<PathBuf>, String> {
    task(&state, move |w| {
        let doc = w.documents.get(&id).ok_or("Documento cerrado")?.clone();
        let Some(mut path) = rfd::FileDialog::new().set_title("Exportar copia MD o TXT").add_filter("Markdown", &["md"]).add_filter("Texto plano", &["txt"]).set_file_name(&doc.title).save_file() else { return Ok(None) };
        if path.extension().is_none() { path.set_extension("md"); }
        let expected = target_hash(&path)?;
        if expected.is_some() || doc.format.eol == "Mixto" {
            if rfd::MessageDialog::new().set_title("Exportar copia").set_description("Al exportar Markdown a TXT se retirarán las marcas de formato. Se conservará la codificación; los saltos mixtos se normalizarán a LF. Si el destino existe, se reemplazará sin generar un archivo .bak. ¿Continuar?").set_buttons(rfd::MessageButtons::YesNo).show() != rfd::MessageDialogResult::Yes { return Ok(None); }
        }
        w.export_copy(&id, text, path, expected).map(Some)
    }).await
}
#[tauri::command]
async fn checkpoint(state: State<'_, Shared>, id: String, text: String) -> Result<(), String> { task(&state, move |w| w.checkpoint(&id, text)).await }
#[tauri::command]
async fn check_external(state: State<'_, Shared>, id: String) -> Result<bool, String> { task(&state, move |w| w.changed(&id)).await }
#[tauri::command]
async fn reload_document(state: State<'_, Shared>, id: String) -> Result<Document, String> { task(&state, move |w| w.reload(&id)).await }
#[tauri::command]
async fn close_document(state: State<'_, Shared>, id: String) -> Result<(), String> { task(&state, move |w| w.close(&id)).await }
#[tauri::command]
async fn confirm_discard(state: State<'_, Shared>, title: String, reload: bool) -> Result<String, String> {
    task(&state, move |_| {
        let result = rfd::MessageDialog::new().set_title("Cambios sin guardar").set_description(format!("{title}\n{}", if reload { "¿Recargar el archivo del disco? Sus cambios se archivarán en recovery." } else { "¿Guardar los cambios antes de cerrar? Sí: guardar. No: descartar. Cancelar: seguir editando." }))
            .set_buttons(if reload { rfd::MessageButtons::YesNo } else { rfd::MessageButtons::YesNoCancel }).show();
        Ok(match result { rfd::MessageDialogResult::Yes => "save", rfd::MessageDialogResult::No => "discard", _ => "cancel" }.into())
    }).await
}

fn main() {
    let cwd = std::env::current_dir().unwrap_or_default().to_string_lossy().into_owned();
    let pending = Arc::new(Mutex::new(cli_paths(std::env::args().collect(), &cwd)));
    let incoming = pending.clone();
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(move |app, args, cwd| {
            if let Ok(mut paths) = incoming.lock() { paths.extend(cli_paths(args, &cwd)); }
            let _ = app.emit("files-pending", ());
            if let Some(window) = app.get_webview_window("main") { let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus(); }
        }))
        .manage(Pending(pending))
        .setup(|app| {
            let data = app.path().app_local_data_dir()?;
            let mut workspace = Workspace::new(data).map_err(std::io::Error::other)?;
            let warning = workspace.restore().err();
            app.manage(StartupWarning(Mutex::new(warning)));
            app.manage(Arc::new(Mutex::new(workspace))); Ok(())
        })
        .invoke_handler(tauri::generate_handler![bootstrap, open_pending, new_document, open_document, open_path, open_folder, list_folder, remove_folder, save_note, system_fonts, spell_check, save_document, export_document, checkpoint, check_external, reload_document, close_document, confirm_discard])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        rfd::MessageDialog::new().set_title("SintaxTrama no pudo iniciarse").set_description(error.to_string()).show();
    }
}
