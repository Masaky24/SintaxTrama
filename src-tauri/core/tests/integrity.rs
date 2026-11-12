use editor_md_core::{Workspace, target_hash};
use std::fs;
use tempfile::tempdir;

#[test]
fn restored_note_prefers_the_latest_successful_note_file() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("novela.md");
    fs::write(&path, "base").unwrap();
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap();
      w.checkpoint(&doc.id, "borrador".into()).unwrap(); w.save_note(&doc.id,"nota antigua".into()).unwrap();
      let locked = fs::OpenOptions::new().read(true).share_mode(0).open(data.join("recovery").join(format!("{}.json",doc.id))).unwrap();
      assert!(w.save_note(&doc.id,"nota más reciente".into()).is_err()); drop(locked); }
    let mut w = Workspace::new(data).unwrap(); let documents = w.restore().unwrap();
    assert_eq!(documents[0].note, "nota más reciente");
}

#[test]
fn metadata_failure_does_not_turn_a_committed_save_into_a_conflict() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("novela.md");
    fs::write(&path,"base").unwrap(); let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap();
    w.save_note(&doc.id,"nota".into()).unwrap();
    let note = fs::read_dir(data.join("notes")).unwrap().next().unwrap().unwrap().path();
    let locked = fs::OpenOptions::new().read(true).share_mode(0).open(note).unwrap();
    let committed = w.save(&doc.id,"texto nuevo".into(),None,None);
    assert_eq!(fs::read_to_string(&path).unwrap(),"texto nuevo");
    assert!(committed.is_ok(), "A committed manuscript needs an explicit success-with-warning result");
    let committed = committed.unwrap(); assert!(!committed.warnings.is_empty()); assert!(committed.document.metadata_pending);
    drop(locked); let retried = w.save(&doc.id,"texto nuevo".into(),None,None).unwrap();
    assert!(retried.warnings.is_empty()); assert!(!retried.document.metadata_pending);
    assert_eq!(fs::read_dir(dir.path()).unwrap().flatten().filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("bak")).count(),0);
}

#[test]
fn committed_save_as_with_failed_history_recovers_its_new_path_and_retries() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let source = dir.path().join("source.md"); let target = dir.path().join("destino.txt"); fs::write(&source,"base").unwrap();
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&source).unwrap(); w.save_note(&doc.id,"nota del destino".into()).unwrap();
      let locked = fs::OpenOptions::new().read(true).share_mode(0).open(data.join("recents.json")).unwrap();
      let outcome = w.save(&doc.id,"texto nuevo".into(),Some(target.clone()),None).unwrap(); assert!(!outcome.warnings.is_empty()); assert!(outcome.document.metadata_pending); drop(locked); }
    let mut w = Workspace::new(data).unwrap(); let docs = w.restore().unwrap(); assert_eq!(docs[0].path.as_ref(),Some(&fs::canonicalize(&target).unwrap())); assert_eq!(docs[0].note,"nota del destino");
    let outcome = w.save(&docs[0].id,docs[0].text.clone(),None,None).unwrap(); assert!(outcome.warnings.is_empty()); assert_eq!(fs::read_to_string(source).unwrap(),"base");
}

#[test]
fn unreadable_latest_note_is_refreshed_before_saving_after_unlock() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("n.md"); fs::write(&path,"base").unwrap();
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap(); w.checkpoint(&doc.id,"borrador".into()).unwrap(); w.save_note(&doc.id,"antigua".into()).unwrap(); }
    let note = fs::read_dir(data.join("notes")).unwrap().next().unwrap().unwrap().path();
    fs::write(&note,serde_json::to_vec(&serde_json::json!({"version":1,"revision":2,"text":"más reciente"})).unwrap()).unwrap();
    let locked = fs::OpenOptions::new().read(true).share_mode(0).open(&note).unwrap();
    let mut w = Workspace::new(data).unwrap(); assert!(w.restore().is_err()); let id = w.documents.keys().next().unwrap().clone();
    assert!(w.save(&id,"borrador".into(),None,None).is_err()); assert_eq!(fs::read_to_string(&path).unwrap(),"base");
    drop(locked); let outcome = w.save(&id,"borrador".into(),None,None).unwrap(); assert_eq!(outcome.document.note,"más reciente");
    assert_eq!(serde_json::from_slice::<serde_json::Value>(&fs::read(note).unwrap()).unwrap()["text"],"más reciente");
}

#[test]
fn newer_note_wins_even_when_a_previous_metadata_retry_was_pending() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("n.md"); fs::write(&path,"base").unwrap();
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap(); w.save_note(&doc.id,"antigua".into()).unwrap();
      let history = fs::OpenOptions::new().read(true).share_mode(0).open(data.join("recents.json")).unwrap();
      assert!(w.save(&doc.id,"borrador".into(),None,None).unwrap().document.metadata_pending); drop(history);
      let record = fs::OpenOptions::new().read(true).share_mode(0).open(data.join("recovery").join(format!("{}.json",doc.id))).unwrap();
      assert!(w.save_note(&doc.id,"nota posterior".into()).is_err()); drop(record); }
    let mut w = Workspace::new(data).unwrap(); let docs = w.restore().unwrap(); assert_eq!(docs[0].note,"nota posterior");
    assert!(w.save(&docs[0].id,docs[0].text.clone(),None,None).unwrap().warnings.is_empty());
}

#[test]
fn legacy_plain_notes_remain_readable_and_are_preserved_on_migration() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("n.md"); fs::write(&path,"base").unwrap();
    let legacy;
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap(); w.save_note(&doc.id,"inicial".into()).unwrap();
      let json = fs::read_dir(data.join("notes")).unwrap().next().unwrap().unwrap().path(); legacy = json.with_extension("txt"); fs::write(&legacy,"nota de 0.1.4").unwrap(); fs::remove_file(json).unwrap(); }
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap(); assert_eq!(doc.note,"nota de 0.1.4"); w.save_note(&doc.id,"nota de 0.1.5".into()).unwrap(); }
    assert_eq!(fs::read_to_string(legacy).unwrap(),"nota de 0.1.4"); let mut w = Workspace::new(data).unwrap(); assert_eq!(w.open(&path).unwrap().note,"nota de 0.1.5");
}

#[test]
fn a_deleted_folder_can_still_be_removed_by_its_original_path() {
    let dir = tempdir().unwrap(); let folder = dir.path().join("carpeta"); fs::create_dir(&folder).unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); w.set_root(folder.clone()).unwrap(); fs::remove_dir(&folder).unwrap();
    w.remove_root(&folder).unwrap(); assert!(w.folders().is_empty());
}

#[test]
fn removing_a_folder_accepts_the_same_raw_path_that_was_selected() {
    let dir = tempdir().unwrap(); let folder = dir.path().join("carpeta"); fs::create_dir(&folder).unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); w.set_root(folder.clone()).unwrap();
    w.remove_root(&folder).unwrap(); assert!(w.folders().is_empty());
}

#[test]
fn notes_survive_restart_without_modifying_the_manuscript() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("novela.md");
    fs::write(&path, "# Original\r\n").unwrap();
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap(); w.save_note(&doc.id, "Nota privada 😀".into()).unwrap(); }
    let mut w = Workspace::new(data).unwrap(); let doc = w.open(&path).unwrap();
    assert_eq!(doc.note, "Nota privada 😀"); assert_eq!(fs::read_to_string(path).unwrap(), "# Original\r\n");
}
#[test]
fn untitled_notes_recover_and_follow_save_as() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let target = dir.path().join("nota.txt");
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.create(); w.save_note(&doc.id, "Recordatorio".into()).unwrap(); }
    { let mut w = Workspace::new(data.clone()).unwrap(); let docs = w.restore().unwrap(); assert_eq!(docs.len(), 1); w.save(&docs[0].id, "Texto".into(), Some(target.clone()), None).unwrap(); }
    let mut w = Workspace::new(data).unwrap(); assert_eq!(w.open(&target).unwrap().note, "Recordatorio");
}
#[test]
fn multiple_folders_persist_and_removing_one_revokes_its_access() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let first = dir.path().join("primero"); let second = dir.path().join("segundo");
    fs::create_dir_all(&first).unwrap(); fs::create_dir_all(&second).unwrap(); let path = first.join("texto.md"); fs::write(&path, "a").unwrap();
    { let mut w = Workspace::new(data.clone()).unwrap(); w.set_root(first.clone()).unwrap(); w.set_root(second.clone()).unwrap(); }
    let mut w = Workspace::new(data).unwrap(); assert_eq!(w.folders().len(), 2); assert_eq!(w.list(&first).unwrap().len(), 1);
    w.remove_root(&fs::canonicalize(first).unwrap()).unwrap(); assert!(w.open_authorized(&path).is_err()); assert!(w.list(&second).is_ok());
}

#[test]
fn external_edit_and_deletion_never_overwrite() {
    let dir = tempdir().unwrap(); let path = dir.path().join("chapter.md");
    fs::write(&path, "Original\r\n").unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.open(&path).unwrap();
    fs::write(&path, "Editado externamente").unwrap();
    assert!(w.save(&doc.id, "Mi edición".into(), None, None).unwrap_err().contains("CONFLICTO"));
    assert_eq!(fs::read_to_string(&path).unwrap(), "Editado externamente");
    fs::remove_file(&path).unwrap();
    assert!(w.save(&doc.id, "Mi edición".into(), None, None).is_err()); assert!(!path.exists());
}

#[test]
fn recovery_survives_restart_with_original_baseline() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let path = dir.path().join("n.md");
    fs::write(&path, "Base").unwrap();
    let id;
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap(); id = doc.id;
      w.checkpoint(&id, "Texto recuperable 😀".into()).unwrap(); }
    let mut w = Workspace::new(data).unwrap(); let docs = w.restore().unwrap();
    assert_eq!(docs.len(), 1); assert_eq!(docs[0].text, "Texto recuperable 😀"); assert_eq!(docs[0].base_text, "Base");
    fs::write(&path, "Otro editor").unwrap();
    assert!(w.save(&id, docs[0].text.clone(), None, None).is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "Otro editor");
}

#[test]
fn preserve_bytes_without_creating_backups() {
    let dir = tempdir().unwrap(); let path = dir.path().join("n.md");
    let original = b"\xef\xbb\xbfUno\r\nDos\r\n"; fs::write(&path, original).unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.open(&path).unwrap();
    w.save(&doc.id, "Uno\nTres\n".into(), None, None).unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbfUno\r\nTres\r\n");
    let backups: Vec<_> = fs::read_dir(dir.path()).unwrap().flatten().filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("bak")).collect();
    assert!(backups.is_empty());
}

#[test]
fn save_as_never_clobbers_unexpected_target() {
    let dir = tempdir().unwrap(); let path = dir.path().join("n.txt");
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.create();
    assert!(target_hash(&path).unwrap().is_none()); fs::write(&path, "Llegó después del diálogo").unwrap();
    assert!(w.save(&doc.id, "Nuevo".into(), Some(path.clone()), None).is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "Llegó después del diálogo");
}

#[test]
fn conversion_failure_leaves_original_untouched() {
    let dir = tempdir().unwrap(); let path = dir.path().join("mixed.md");
    let bytes = b"Uno\r\nDos\n"; fs::write(&path, bytes).unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.open(&path).unwrap();
    assert!(w.save(&doc.id, "Cambio\n".into(), None, None).is_err()); assert_eq!(fs::read(path).unwrap(), bytes);
}

#[test]
fn second_instance_is_rejected_and_close_removes_recovery() {
    let dir = tempdir().unwrap(); let mut w = Workspace::new(dir.path().into()).unwrap();
    assert!(Workspace::new(dir.path().into()).is_err()); let doc = w.create();
    w.checkpoint(&doc.id, "borrador".into()).unwrap(); w.close(&doc.id).unwrap();
    assert!(w.restore().unwrap().is_empty()); assert!(w.checkpoint("../../bad", "x".into()).is_err());
}

#[test]
fn utf16_edit_preserves_endianness_and_bom() {
    let dir = tempdir().unwrap(); let path = dir.path().join("n.txt");
    fs::write(&path, [0xfe, 0xff, 0, 65, 0, 13, 0, 10]).unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.open(&path).unwrap();
    w.save(&doc.id, "B\n".into(), None, None).unwrap();
    assert_eq!(fs::read(path).unwrap(), [0xfe, 0xff, 0, 66, 0, 13, 0, 10]);
}

#[test]
fn explorer_rejects_escape_and_duplicate_open_uses_same_tab() {
    let dir = tempdir().unwrap(); let root = dir.path().join("novela"); fs::create_dir(&root).unwrap();
    let path = root.join("n.md"); fs::write(&path, "a").unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); w.set_root(root).unwrap();
    assert!(w.list(dir.path()).is_err()); let a = w.open_authorized(&path).unwrap(); let b = w.open(&path).unwrap(); assert_eq!(a.id, b.id);
}

#[cfg(windows)]
#[test]
fn locked_destination_retains_original_and_recovery() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempdir().unwrap(); let path = dir.path().join("locked.md"); let data = dir.path().join("data");
    fs::write(&path, "Original").unwrap(); let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.open(&path).unwrap();
    let lock = fs::OpenOptions::new().read(true).share_mode(1).open(&path).unwrap();
    assert!(w.save(&doc.id, "Edición".into(), None, None).is_err());
    drop(lock); assert_eq!(fs::read_to_string(&path).unwrap(), "Original");
    assert!(data.join("recovery").join(format!("{}.json", doc.id)).exists());
}

#[test]
fn save_as_cannot_replace_another_open_tab() {
    let dir = tempdir().unwrap(); let path = dir.path().join("n.md"); fs::write(&path, "Original").unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); w.open(&path).unwrap(); let new = w.create();
    assert!(w.save(&new.id, "Nuevo".into(), Some(path.clone()), target_hash(&path).unwrap()).is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "Original");
}

#[test]
fn export_is_a_copy_and_leaves_the_source_baseline_unchanged() {
    let dir = tempdir().unwrap(); let source = dir.path().join("n.md"); let target = dir.path().join("copia.txt");
    fs::write(&source, "Original\r\n").unwrap(); let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.open(&source).unwrap();
    w.export_copy(&doc.id, "Edición\n".into(), target.clone(), None).unwrap();
    assert_eq!(fs::read(&target).unwrap(), "Edición\r\n".as_bytes()); assert_eq!(fs::read_to_string(&source).unwrap(), "Original\r\n");
    assert_eq!(w.documents[&doc.id].base_text, "Original\n"); assert_eq!(w.documents[&doc.id].path, doc.path);
    assert!(w.export_copy(&doc.id, "Otra".into(), source.clone(), target_hash(&source).unwrap()).is_err());
}

#[test]
fn save_as_moves_the_session_and_preserves_the_original_file() {
    let dir = tempdir().unwrap(); let source = dir.path().join("n.md"); let target = dir.path().join("nuevo.txt");
    let original = b"\xef\xbb\xbfOriginal\r\n"; fs::write(&source, original).unwrap();
    let mut w = Workspace::new(dir.path().join("data")).unwrap(); let doc = w.open(&source).unwrap();
    let saved = w.save(&doc.id, "Edición\n".into(), Some(target.clone()), None).unwrap().document;
    assert_eq!(fs::read(&source).unwrap(), original); assert_eq!(fs::read(&target).unwrap(), "\u{feff}Edición\r\n".as_bytes());
    assert_eq!(saved.path.unwrap(), fs::canonicalize(target).unwrap()); assert_eq!(saved.title, "nuevo.txt"); assert_eq!(saved.base_text, "Edición\n");
}

#[test]
fn first_save_of_an_untitled_document_creates_the_file_and_clears_recovery() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let target = dir.path().join("nuevo.md");
    let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.create();
    let saved = w.save(&doc.id, "Nuevo\n".into(), Some(target.clone()), None).unwrap().document;
    assert_eq!(fs::read(target).unwrap(), b"Nuevo\r\n"); assert_eq!(saved.base_text, "Nuevo\n");
    assert!(!data.join("recovery").join(format!("{}.json", doc.id)).exists());
}
