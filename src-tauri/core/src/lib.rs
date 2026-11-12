pub mod format;
pub mod plain_text;
mod storage;

use format::Format;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs::{self, File, OpenOptions}, path::{Path, PathBuf}};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub path: Option<PathBuf>,
    pub title: String,
    pub text: String,
    pub base_text: String,
    pub disk_hash: Option<String>,
    pub format: Format,
    pub recovered: bool,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub metadata_pending: bool,
    #[serde(default)]
    pub note_read_failed: bool,
    #[serde(default)]
    pub note_revision: u64,
    #[serde(default)]
    pub note_id: String,
}

#[derive(Serialize, Deserialize)]
struct NoteRecord { version: u8, revision: u64, text: String }

#[derive(Clone, Serialize, Deserialize)]
struct NoteBinding { id: String, path: PathBuf, file_identity: Option<String>, hash: String }
#[derive(Serialize, Deserialize)]
struct NoteIndex { version: u8, bindings: Vec<NoteBinding> }

#[derive(Debug, Serialize)]
pub struct SaveOutcome { pub document: Document, pub warnings: Vec<String> }

#[derive(Clone, Serialize, Deserialize)]
pub struct Recent { pub path: PathBuf, pub title: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry { pub path: PathBuf, pub title: String, pub directory: bool }

pub struct Workspace {
    pub documents: HashMap<String, Document>,
    pub recents: Vec<Recent>,
    data: PathBuf,
    roots: Vec<PathBuf>,
    note_bindings: Vec<NoteBinding>,
    note_index_error: Option<String>,
    _lock: File,
}

fn supported(path: &Path) -> bool {
    path.extension().and_then(|s| s.to_str()).map(|s| matches!(s.to_lowercase().as_str(), "md" | "txt")).unwrap_or(false)
}
fn title(path: &Path) -> String { path.file_name().unwrap_or_default().to_string_lossy().into_owned() }
#[cfg(windows)]
fn path_key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('/', "\\");
    let text = if let Some(unc) = text.strip_prefix("\\\\?\\UNC\\") { format!("\\\\{unc}") } else { text.strip_prefix("\\\\?\\").unwrap_or(&text).to_string() };
    text.trim_end_matches('\\').to_lowercase()
}
#[cfg(not(windows))]
fn path_key(path: &Path) -> PathBuf { path.to_path_buf() }
fn same_path(left: &Path, right: &Path) -> bool { path_key(left) == path_key(right) }
fn valid_note_index(index: &NoteIndex) -> bool {
    if index.version != 1 { return false; }
    let mut ids = HashSet::new(); let mut paths = HashSet::new(); let mut files = HashSet::new();
    index.bindings.iter().all(|binding| {
        Uuid::parse_str(&binding.id).is_ok() && binding.path.is_absolute()
            && binding.hash.len() == 64 && binding.hash.bytes().all(|b| b.is_ascii_hexdigit())
            && ids.insert(binding.id.clone()) && paths.insert(path_key(&binding.path))
            && binding.file_identity.as_ref().is_none_or(|key| files.insert(key.clone()))
    })
}

impl Workspace {
    pub fn new(data: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(data.join("recovery")).map_err(|e| e.to_string())?;
        let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(data.join("instance.lock")).map_err(|e| e.to_string())?;
        lock.try_lock_exclusive().map_err(|_| "El editor ya está abierto. Cierre la otra instancia.".to_string())?;
        let recents = match fs::read(data.join("recents.json")) {
            Ok(b) => serde_json::from_slice::<Vec<Recent>>(&b).unwrap_or_default(),
            Err(_) => Vec::new(),
        };
        let roots = match fs::read(data.join("folders.json")) {
            Ok(bytes) => serde_json::from_slice::<Vec<PathBuf>>(&bytes).unwrap_or_default().into_iter().filter(|p| p.is_absolute() && p.is_dir()).take(30).collect(),
            Err(_) => Vec::new(),
        };
        fs::create_dir_all(data.join("notes")).map_err(|e| e.to_string())?;
        let (note_bindings, note_index_error) = match fs::read(data.join("note-identities.json")) {
            Ok(bytes) => match serde_json::from_slice::<NoteIndex>(&bytes) {
                Ok(index) if valid_note_index(&index) => (index.bindings, None),
                _ => (Vec::new(), Some("El indice de notas es ilegible o incompatible. Se conservo sin modificar; las recuperaciones por UUID siguen disponibles. No se reasignaran notas hasta reparar el indice.".to_string())),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (Vec::new(), None),
            Err(error) => (Vec::new(), Some(format!("No se pudo abrir el indice de notas: {error}. Se conservo; las recuperaciones siguen disponibles."))),
        };
        Ok(Self { documents: HashMap::new(), recents, data, roots, note_bindings, note_index_error, _lock: lock })
    }

    pub fn restore(&mut self) -> Result<Vec<Document>, String> {
        let mut ids = Vec::new();
        let mut corrupt = false;
        for entry in fs::read_dir(self.data.join("recovery")).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if !matches!(path.extension().and_then(|s| s.to_str()), Some("json" | "slot1" | "slot2")) { continue; }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else { continue; };
            if Uuid::parse_str(id).is_err() { corrupt = true; continue; }
            if !ids.iter().any(|existing| existing == id) { ids.push(id.to_owned()); }
        }
        let mut docs = Vec::new();
        let mut unreadable_note = false;
        for id in ids {
            let mut restored = None;
            for path in self.recovery_paths(&id)? {
                if !path.exists() { continue; }
                let parsed = storage::read_limited(&path, storage::MAX_BYTES * 12 + 65536).and_then(|b| serde_json::from_slice::<Document>(&b).map_err(|e| e.to_string()));
                match parsed {
                    Ok(doc) if doc.id == id && (doc.note_id.is_empty() || Uuid::parse_str(&doc.note_id).is_ok()) => { restored = Some(doc); break; },
                    _ => { corrupt = true; }
                }
            }
            let Some(mut doc) = restored else { continue; };
            if doc.note_id.is_empty() {
                doc.note_id = doc.path.as_ref().and_then(|path| self.note_bindings.iter().find(|b| same_path(&b.path, path))).map(|b| b.id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
            }
            match self.read_note_for(&doc.note_id, doc.path.as_deref()) {
                Ok(Some(note)) if note.revision >= doc.note_revision => { doc.note = note.text; doc.note_revision = note.revision; doc.note_read_failed = false; },
                Ok(_) => { doc.note_read_failed = false; },
                Err(_) => { unreadable_note = true; doc.metadata_pending = true; doc.note_read_failed = true; },
            }
            doc.recovered = true;
            self.documents.insert(doc.id.clone(), doc.clone()); docs.push(doc);
        }
        if let Some(error) = &self.note_index_error { return Err(error.clone()); }
        if corrupt { return Err("Hay una recuperación ilegible en recovery. Se conservó sin modificar; las versiones rotativas válidas siguen disponibles.".into()); }
        if unreadable_note { return Err("No se pudieron leer algunas notas locales. Se conservó la nota de recuperación; revise ambas copias antes de guardar.".into()); }
        Ok(docs)
    }

    pub fn create(&mut self) -> Document {
        let doc = Document { id: Uuid::new_v4().to_string(), path: None, title: "Sin título.md".into(), text: String::new(), base_text: String::new(), disk_hash: None, format: Format::default(), recovered: false, note: String::new(), metadata_pending: false, note_read_failed: false, note_revision: 0, note_id: Uuid::new_v4().to_string() };
        self.documents.insert(doc.id.clone(), doc.clone()); doc
    }

    pub fn open(&mut self, path: &Path) -> Result<Document, String> {
        if !supported(path) { return Err("Seleccione un archivo .md o .txt.".into()); }
        let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
        if let Some(doc) = self.documents.values().find(|d| d.path.as_ref() == Some(&path)) { return Ok(doc.clone()); }
        let bytes = storage::read(&path)?;
        let (text, format) = format::decode(&bytes)?;
        if text.len() as u64 > storage::MAX_BYTES { return Err("El texto decodificado supera 20 MiB UTF-8.".into()); }
        let note_id = self.resolve_note_identity(&path, &storage::hash(&bytes))?;
        let note = self.read_note_for(&note_id, Some(&path))?.unwrap_or(NoteRecord { version: 1, revision: 0, text: String::new() });
        // A rename or another physical alias is still the same editing session.
        // Keep its pending body, baseline and history identity instead of
        // creating a second writer for the same stable note.
        if let Some(mut existing) = self.documents.values().find(|doc| doc.note_id == note_id).cloned() {
            existing.path = Some(path.clone()); existing.title = title(&path);
            if note.revision >= existing.note_revision {
                existing.note = note.text; existing.note_revision = note.revision;
            }
            self.remember(&path)?;
            if existing.text != existing.base_text || existing.recovered || existing.metadata_pending {
                self.write_recovery(&existing.id, &existing)?;
            }
            self.documents.insert(existing.id.clone(), existing.clone());
            return Ok(existing);
        }
        let doc = Document { id: Uuid::new_v4().to_string(), title: title(&path), path: Some(path.clone()), base_text: text.clone(), text, disk_hash: Some(storage::hash(&bytes)), format, recovered: false, note: note.text, metadata_pending: false, note_read_failed: false, note_revision: note.revision, note_id };
        self.remember(&path)?;
        self.documents.insert(doc.id.clone(), doc.clone()); Ok(doc)
    }

    fn remember(&mut self, path: &Path) -> Result<(), String> {
        let mut recents = self.recents.clone();
        recents.retain(|r| r.path != path); recents.insert(0, Recent { path: path.to_path_buf(), title: title(path) }); recents.truncate(15);
        storage::atomic_private(&self.data.join("recents.json"), &serde_json::to_vec(&recents).map_err(|e| e.to_string())?)?;
        self.recents = recents; Ok(())
    }

    fn record_path(&self, id: &str) -> Result<PathBuf, String> {
        Uuid::parse_str(id).map_err(|_| "Identificador inválido")?;
        Ok(self.data.join("recovery").join(format!("{id}.json")))
    }

    fn recovery_paths(&self, id: &str) -> Result<[PathBuf; 3], String> {
        let current = self.record_path(id)?;
        Ok([current.clone(), current.with_extension("slot1"), current.with_extension("slot2")])
    }
    fn clear_recovery(&self, id: &str) -> Result<(), String> {
        // Remove the current record last so a partial cleanup still restores it.
        let paths = self.recovery_paths(id)?;
        for path in [&paths[2], &paths[1], &paths[0]] {
            if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
        }
        Ok(())
    }
    fn write_recovery(&self, id: &str, doc: &Document) -> Result<(), String> {
        let paths = self.recovery_paths(id)?;
        let bytes = serde_json::to_vec(doc).map_err(|e| e.to_string())?;
        let mut previous = Vec::<Vec<u8>>::new();
        for path in &paths {
            if !path.exists() { continue; }
            let candidate = storage::read_limited(path, storage::MAX_BYTES * 12 + 65536)?;
            if path == &paths[0] && candidate == bytes { return Ok(()); }
            // Corrupt generations are never copied over a usable fallback.
            let valid = serde_json::from_slice::<Document>(&candidate).is_ok_and(|record| record.id == id && (record.note_id.is_empty() || Uuid::parse_str(&record.note_id).is_ok()));
            if valid && candidate != bytes && !previous.contains(&candidate) { previous.push(candidate); }
            if previous.len() == 2 { break; }
        }
        // Commit the new current FIRST. A locked/unwritable current leaves every
        // fallback untouched; after success, rotation errors cannot lose it.
        storage::atomic_private(&paths[0], &bytes)?;
        if let Some(older) = previous.get(1) { storage::atomic_private(&paths[2], older)?; }
        if let Some(latest) = previous.first() { storage::atomic_private(&paths[1], latest)?; }
        Ok(())
    }

    pub fn checkpoint(&mut self, id: &str, text: String) -> Result<(), String> {
        if text.len() as u64 > storage::MAX_BYTES { return Err("El texto supera el límite de recuperación (20 MiB UTF-8).".into()); }
        let mut doc = self.documents.get(id).ok_or("Documento cerrado")?.clone();
        doc.text = text;
        if doc.text != doc.base_text || doc.recovered || doc.metadata_pending || (doc.path.is_none() && !doc.note.is_empty()) {
            self.write_recovery(id, &doc)?;
        } else { self.clear_recovery(id)?; }
        self.documents.insert(id.into(), doc); Ok(())
    }

    pub fn changed(&self, id: &str) -> Result<bool, String> {
        let doc = self.documents.get(id).ok_or("Documento cerrado")?;
        match &doc.path {
            Some(path) => Ok(storage::read(path).map(|b| Some(storage::hash(&b)) != doc.disk_hash).unwrap_or(true)),
            None => Ok(false),
        }
    }

    pub fn save(&mut self, id: &str, text: String, target: Option<PathBuf>, expected_target: Option<String>) -> Result<SaveOutcome, String> {
        // Persist a recovery BEFORE touching the destination, including on first save.
        self.checkpoint(id, text.clone())?;
        let mut doc = self.documents.get(id).ok_or("Documento cerrado")?.clone();
        // A body save must never roll a separate note back to an older revision.
        // If a previously readable note is now blocked, the body may still commit
        // with an explicit warning; do not overwrite the unverified note.
        let mut note_warning = None;
        match self.read_note_for(&doc.note_id, doc.path.as_deref()) {
            Ok(Some(note)) => {
                if note.revision >= doc.note_revision { doc.note = note.text; doc.note_revision = note.revision; }
                doc.note_read_failed = false;
            },
            Ok(None) => { doc.note_read_failed = false; },
            Err(error) if doc.note_read_failed => return Err(error),
            Err(error) => { doc.note_read_failed = true; note_warning = Some(error); },
        }
        let save_as = target.is_some();
        let path = target.or_else(|| doc.path.clone()).ok_or("Use Guardar como")?;
        if !supported(&path) { return Err("El nombre debe terminar en .md o .txt.".into()); }
        let path = if path.exists() { fs::canonicalize(&path).map_err(|e| e.to_string())? } else {
            fs::canonicalize(path.parent().ok_or("Ruta sin carpeta")?).map_err(|e| e.to_string())?.join(path.file_name().ok_or("Nombre vacío")?)
        };
        if self.documents.values().any(|d| d.id != id && d.path.as_ref() == Some(&path)) {
            return Err("El destino está abierto en otra pestaña. Guarde con otro nombre.".into());
        }
        let same_path = doc.path.as_ref() == Some(&path);
        if !same_path {
            let existing_revision = self.read_note_record(&path)?.map(|note| note.revision).unwrap_or(0);
            // Save As forks the note association; later edits must not alter the source note.
            if doc.path.is_some() { doc.note_id = Uuid::new_v4().to_string(); }
            doc.note_revision = doc.note_revision.max(existing_revision).checked_add(1).ok_or("No se pudo generar la revisión de la nota.")?;
        } else if doc.note_revision == 0 { doc.note_revision = 1; }
        let expected = if same_path || !save_as { doc.disk_hash.clone() } else { expected_target };
        let unchanged = !save_as && doc.text == doc.base_text && !self.changed(id)?;
        if unchanged && !doc.metadata_pending && !doc.recovered && note_warning.is_none() {
            self.documents.insert(id.into(), doc.clone());
            return Ok(SaveOutcome { document: doc, warnings: vec![] });
        }
        if doc.format.eol == "Mixto" {
            if !save_as || same_path { return Err("Saltos mixtos: guarde una copia con otro nombre. La copia usará LF.".into()); }
            doc.format.eol = "LF".into();
        }
        if !unchanged {
            let bytes = format::encode(&text, &doc.format)?;
            storage::replace(&path, &bytes, expected.as_deref())?;
            doc.disk_hash = Some(storage::hash(&bytes));
        }
        // After the manuscript commits, retain its new identity even if a
        // separate local metadata write fails. A retry must use the new hash.
        doc.path = Some(path.clone()); doc.title = title(&path); doc.text = text.clone(); doc.base_text = text.clone(); doc.recovered = false; doc.metadata_pending = true;
        self.documents.insert(id.into(), doc.clone());
        let mut warnings = Vec::new();
        if let Some(error) = note_warning {
            warnings.push(format!("El archivo está guardado, pero no se verificó la nota local; se conservó sin reemplazar: {error}"));
        } else if let Err(e) = self.write_note(&doc.note_id, &doc.note, doc.note_revision) { warnings.push(format!("El archivo está guardado, pero sus notas siguen pendientes: {e}")); }
        if let Err(e) = self.bind_note(&doc.note_id, &path, doc.disk_hash.as_deref().unwrap_or_default()) { warnings.push(format!("El archivo está guardado, pero su identidad de nota sigue pendiente: {e}")); }
        if let Err(e) = self.remember(&path) { warnings.push(format!("El archivo está guardado, pero no se actualizó la lista de recientes: {e}")); }
        if warnings.is_empty() { if let Err(e) = self.clear_recovery(id) { warnings.push(format!("El archivo está guardado, pero no se pudo retirar su recuperación: {e}")); } }
        doc.metadata_pending = !warnings.is_empty(); self.documents.insert(id.into(), doc.clone());
        if doc.metadata_pending {
            if let Err(e) = self.checkpoint(id, text) { warnings.push(format!("No se pudo actualizar la recuperación del guardado; conserve también el archivo del destino: {e}")); }
        }
        Ok(SaveOutcome { document: doc, warnings })
    }

    pub fn close(&mut self, id: &str) -> Result<(), String> {
        self.clear_recovery(id)?;
        self.documents.remove(id); Ok(())
    }

    pub fn export_copy(&mut self, id: &str, text: String, target: PathBuf, expected: Option<String>) -> Result<PathBuf, String> {
        self.checkpoint(id, text.clone())?;
        if !supported(&target) { return Err("La copia debe terminar en .md o .txt.".into()); }
        let path = if target.exists() { fs::canonicalize(&target).map_err(|e| e.to_string())? } else {
            fs::canonicalize(target.parent().ok_or("Ruta sin carpeta")?).map_err(|e| e.to_string())?.join(target.file_name().ok_or("Nombre vacío")?)
        };
        if self.documents.values().any(|d| d.path.as_ref() == Some(&path)) { return Err("Exporte a otro nombre; el destino está abierto en el editor.".into()); }
        let mut format = self.documents.get(id).ok_or("Documento cerrado")?.format.clone();
        if format.eol == "Mixto" { format.eol = "LF".into(); }
        let source = self.documents.get(id).ok_or("Documento cerrado")?;
        let export_text = if path.extension().and_then(|s| s.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("txt")) && source.title.to_lowercase().ends_with(".md") { crate::plain_text::markdown_to_text(&text) } else { text.clone() };
        let bytes = format::encode(&export_text, &format)?;
        storage::replace(&path, &bytes, expected.as_deref())?;
        Ok(path)
    }

    fn note_path(&self, path: &Path) -> PathBuf {
        self.data.join("notes").join(format!("{}.json", storage::hash(path.to_string_lossy().as_bytes())))
    }
    fn stable_note_path(&self, id: &str) -> Result<PathBuf, String> {
        Uuid::parse_str(id).map_err(|_| "Identificador de nota inválido")?;
        Ok(self.data.join("notes").join(format!("{id}.json")))
    }
    fn read_note_file(&self, file: &Path) -> Result<Option<NoteRecord>, String> {
        if file.exists() {
            let record: NoteRecord = serde_json::from_slice(&storage::read_limited(file, 65536 * 6 + 1024)?).map_err(|e| format!("No se pudo leer la nota local; se conservó sin modificar: {e}"))?;
            if record.version != 1 || record.text.len() > 65536 { return Err("Formato de nota no admitido; se conservó sin modificar.".into()); }
            return Ok(Some(record));
        }
        let legacy = file.with_extension("txt");
        if !legacy.exists() { return Ok(None); }
        let text = String::from_utf8(storage::read_limited(&legacy, 65536)?).map_err(|e| e.to_string())?;
        Ok(Some(NoteRecord { version: 1, revision: 0, text }))
    }
    fn read_note_for(&self, id: &str, path: Option<&Path>) -> Result<Option<NoteRecord>, String> {
        // Once migrated, UUID storage is authoritative. The old path record is
        // retained for compatibility and manual recovery, not updated or removed.
        if let Some(note) = self.read_note_file(&self.stable_note_path(id)?)? { return Ok(Some(note)); }
        match path { Some(path) => self.read_note_file(&self.note_path(path)), None => Ok(None) }
    }
    fn read_note_record(&self, path: &Path) -> Result<Option<NoteRecord>, String> {
        if let Some(binding) = self.note_bindings.iter().find(|b| same_path(&b.path, path)) {
            self.read_note_for(&binding.id, Some(path))
        } else { self.read_note_file(&self.note_path(path)) }
    }
    fn write_note(&self, id: &str, text: &str, revision: u64) -> Result<(), String> {
        let record = NoteRecord { version: 1, revision, text: text.into() };
        storage::atomic_private(&self.stable_note_path(id)?, &serde_json::to_vec(&record).map_err(|e| e.to_string())?)
    }
    fn bind_note(&mut self, id: &str, path: &Path, hash: &str) -> Result<(), String> {
        if let Some(error) = &self.note_index_error { return Err(error.clone()); }
        Uuid::parse_str(id).map_err(|_| "Identificador de nota inválido")?;
        let mut bindings = self.note_bindings.clone();
        bindings.retain(|b| !same_path(&b.path, path));
        // One current location per stable identity. Rename/move does not fork it.
        bindings.retain(|b| b.id != id);
        bindings.push(NoteBinding { id: id.into(), path: path.to_path_buf(), file_identity: storage::file_identity(path)?, hash: hash.into() });
        let bytes = serde_json::to_vec(&NoteIndex { version: 1, bindings: bindings.clone() }).map_err(|e| e.to_string())?;
        storage::atomic_private(&self.data.join("note-identities.json"), &bytes)?;
        self.note_bindings = bindings;
        Ok(())
    }
    fn resolve_note_identity(&mut self, path: &Path, hash: &str) -> Result<String, String> {
        if let Some(error) = &self.note_index_error { return Err(error.clone()); }
        let identity = storage::file_identity(path)?;
        let by_path = self.note_bindings.iter().find(|b| same_path(&b.path, path));
        let by_file = identity.as_ref().and_then(|identity| self.note_bindings.iter().find(|b| b.file_identity.as_ref() == Some(identity)));
        let moved = self.note_bindings.iter().filter(|b| b.hash == hash && matches!(b.path.try_exists(), Ok(false))).collect::<Vec<_>>();
        let previous = by_file.or(by_path).or_else(|| if moved.len() == 1 { Some(moved[0]) } else { None }).cloned();
        let id = previous.as_ref().map(|b| b.id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
        if self.read_note_file(&self.stable_note_path(&id)?)?.is_none() {
            // Legacy associations are migrated on first access without deleting
            // either JSON or TXT originals. A moved legacy path remains readable.
            let legacy_path = previous.as_ref().map(|b| b.path.as_path()).unwrap_or(path);
            if let Some(note) = self.read_note_file(&self.note_path(legacy_path))? { self.write_note(&id, &note.text, note.revision)?; }
        }
        self.bind_note(&id, path, hash)?;
        Ok(id)
    }
    pub fn save_note(&mut self, id: &str, note: String) -> Result<(), String> {
        if note.len() > 65536 { return Err("La nota supera 64 KiB.".into()); }
        let mut doc = self.documents.get(id).ok_or("Documento cerrado")?.clone();
        if doc.note_read_failed {
            if let Some(path) = &doc.path {
                if self.read_note_for(&doc.note_id, Some(path))?.map(|note| note.text).unwrap_or_default() != doc.note { return Err("La nota local tiene otra versión. Guarde primero el documento para cargar esa nota y revisarla antes de reemplazarla.".into()); }
            }
            doc.note_read_failed = false;
        }
        let disk_revision = self.read_note_for(&doc.note_id, doc.path.as_deref())?.map(|record| record.revision).unwrap_or(0);
        doc.note_revision = doc.note_revision.max(disk_revision).checked_add(1).ok_or("No se pudo generar la revisión de la nota.")?;
        if doc.path.is_some() { self.write_note(&doc.note_id, &note, doc.note_revision)?; }
        doc.note = note;
        let text = doc.text.clone(); self.documents.insert(id.into(), doc);
        self.checkpoint(id, text)
    }
    pub fn folders(&self) -> Vec<PathBuf> { self.roots.clone() }
    pub fn remove_root(&mut self, path: &Path) -> Result<(), String> {
        let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let mut roots = self.roots.clone(); roots.retain(|p| !same_path(p, &canonical));
        storage::atomic_private(&self.data.join("folders.json"), &serde_json::to_vec(&roots).map_err(|e| e.to_string())?)?;
        self.roots = roots; Ok(())
    }
    pub fn set_root(&mut self, path: PathBuf) -> Result<Vec<Entry>, String> {
        let path = fs::canonicalize(&path).map_err(|e| e.to_string())?;
        if !path.is_dir() { return Err("Seleccione una carpeta.".into()); }
        let previous = self.roots.clone();
        if !self.roots.contains(&path) {
            if self.roots.len() >= 30 { return Err("Se admiten hasta 30 carpetas abiertas.".into()); }
            self.roots.push(path.clone());
        }
        let entries = match self.list(&path) { Ok(entries) => entries, Err(error) => { self.roots = previous; return Err(error); } };
        if let Err(error) = storage::atomic_private(&self.data.join("folders.json"), &serde_json::to_vec(&self.roots).map_err(|e| e.to_string())?) { self.roots = previous; return Err(error); }
        Ok(entries)
    }

    pub fn list(&self, path: &Path) -> Result<Vec<Entry>, String> {
        let canonical = fs::canonicalize(path).map_err(|e| e.to_string())?;
        if !self.roots.iter().any(|root| canonical.starts_with(root)) { return Err("Ruta fuera de la carpeta autorizada".into()); }
        let mut entries = Vec::new();
        for entry in fs::read_dir(canonical).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if !kind.is_symlink() && (kind.is_dir() || supported(&entry.path())) {
                entries.push(Entry { path: entry.path(), title: entry.file_name().to_string_lossy().into_owned(), directory: kind.is_dir() });
            }
            if entries.len() > 2000 { return Err("La carpeta contiene más de 2000 entradas; abra una subcarpeta.".into()); }
        }
        entries.sort_by_key(|e| (!e.directory, e.title.to_lowercase())); Ok(entries)
    }

    pub fn open_authorized(&mut self, path: &Path) -> Result<Document, String> {
        let canonical = fs::canonicalize(path).map_err(|e| e.to_string())?;
        let allowed = self.roots.iter().any(|r| canonical.starts_with(r))
            || self.recents.iter().any(|r| r.path == canonical);
        if !allowed { return Err("Abra este archivo mediante el diálogo nativo.".into()); }
        self.open(&canonical)
    }

    pub fn reload(&mut self, id: &str) -> Result<Document, String> {
        let old = self.documents.get(id).ok_or("Documento cerrado")?.clone();
        let path = old.path.as_ref().ok_or("Documento sin ruta")?;
        let bytes = storage::read(path)?;
        let (text, format) = format::decode(&bytes)?;
        // Keep the previous recovery as an archive before replacing the view.
        // Existing UUID .archived records remain untouched. New archives have
        // fixed slots, distinct from pending records and never auto-restored.
        if self.recovery_paths(id)?.iter().any(|path| path.exists()) || old.text != old.base_text || old.metadata_pending {
            let archive = self.record_path(&old.note_id)?;
            let slots = [archive.with_extension("reload1"), archive.with_extension("reload2"), archive.with_extension("reload3")];
            if slots[1].exists() { storage::atomic_private(&slots[2], &storage::read_limited(&slots[1], storage::MAX_BYTES * 12 + 65536)?)?; }
            if slots[0].exists() { storage::atomic_private(&slots[1], &storage::read_limited(&slots[0], storage::MAX_BYTES * 12 + 65536)?)?; }
            storage::atomic_private(&slots[0], &serde_json::to_vec(&old).map_err(|e| e.to_string())?)?;
        }
        self.clear_recovery(id)?;
        let doc = Document { text: text.clone(), base_text: text, format, disk_hash: Some(storage::hash(&bytes)), recovered: false, ..old };
        self.documents.insert(id.into(), doc.clone()); Ok(doc)
    }
}

pub fn target_hash(path: &Path) -> Result<Option<String>, String> {
    if path.exists() { Ok(Some(storage::hash(&storage::read(path)?))) } else { Ok(None) }
}
