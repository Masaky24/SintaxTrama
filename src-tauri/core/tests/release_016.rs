use editor_md_core::Workspace;
use std::fs;
use tempfile::tempdir;

#[test]
fn removing_a_deleted_root_resolves_its_existing_parent_alias() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("seleccion")).unwrap();
    let selected = dir.path().join("seleccion").join("..").join("carpeta");
    fs::create_dir(&selected).unwrap();
    let mut workspace = Workspace::new(dir.path().join("data")).unwrap();
    workspace.set_root(selected.clone()).unwrap();
    fs::remove_dir(&selected).unwrap();
    workspace.remove_root(&selected).unwrap();
    assert!(workspace.folders().is_empty());
}

#[test]
fn opening_a_renamed_active_document_keeps_one_session_and_its_pending_text() {
    let dir = tempdir().unwrap();
    let data = dir.path().join("data");
    let original = dir.path().join("original.md");
    let renamed = dir.path().join("renamed.md");
    fs::write(&original, "Base").unwrap();
    let mut w = Workspace::new(data.clone()).unwrap();
    let first = w.open(&original).unwrap();
    w.save_note(&first.id, "Nota antigua".into()).unwrap();
    w.checkpoint(&first.id, "Texto pendiente".into()).unwrap();
    fs::rename(&original, &renamed).unwrap();
    let reopened = w.open(&renamed).unwrap();
    assert_eq!(reopened.id, first.id, "Renaming must not fork an editing session");
    assert_eq!(w.documents.len(), 1);
    assert_eq!(reopened.text, "Texto pendiente");
    assert_eq!(reopened.base_text, "Base");
    assert_eq!(reopened.path, Some(fs::canonicalize(&renamed).unwrap()));
    let recovery: serde_json::Value = serde_json::from_slice(&fs::read(data.join("recovery").join(format!("{}.json", first.id))).unwrap()).unwrap();
    assert_eq!(recovery["path"], serde_json::to_value(&reopened.path).unwrap());
    w.save_note(&first.id, "Nota mas reciente".into()).unwrap();
    let result = w.save(&reopened.id, "Texto pendiente".into(), None, None).unwrap();
    assert!(result.warnings.is_empty());
    drop(w);
    let mut w = Workspace::new(data).unwrap();
    let doc = w.open(&renamed).unwrap();
    assert_eq!(doc.note, "Nota mas reciente");
    assert_eq!(doc.text, "Texto pendiente");
}

#[test]
fn saving_the_body_never_downgrades_a_newer_persisted_note() {
    let dir = tempdir().unwrap();
    let data = dir.path().join("data");
    let path = dir.path().join("chapter.md");
    fs::write(&path, "Base").unwrap();
    let mut w = Workspace::new(data.clone()).unwrap();
    let doc = w.open(&path).unwrap();
    w.save_note(&doc.id, "Nota antigua".into()).unwrap();
    let record = data.join("notes").join(format!("{}.json", doc.note_id));
    fs::write(&record, br#"{"version":1,"revision":9,"text":"Nota mas reciente"}"#).unwrap();
    let saved = w.save(&doc.id, "Cuerpo editado".into(), None, None).unwrap();
    assert!(saved.warnings.is_empty());
    assert_eq!(saved.document.note, "Nota mas reciente");
    assert_eq!(saved.document.note_revision, 9);
    drop(w);
    let mut w = Workspace::new(data).unwrap();
    assert_eq!(w.open(&path).unwrap().note, "Nota mas reciente");
}

#[test]
fn hard_link_aliases_share_one_live_session_instead_of_competing_notes() {
    let dir = tempdir().unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap();
    let a = dir.path().join("a.md");
    let b = dir.path().join("b.md");
    fs::write(&a, "Base").unwrap();
    fs::hard_link(&a, &b).unwrap();
    let first = w.open(&a).unwrap();
    w.checkpoint(&first.id, "Pendiente".into()).unwrap();
    let alias = w.open(&b).unwrap();
    assert_eq!(alias.id, first.id);
    assert_eq!(alias.text, "Pendiente");
    assert_eq!(w.documents.len(), 1);
}
