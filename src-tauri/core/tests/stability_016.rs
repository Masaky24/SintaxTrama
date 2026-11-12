use editor_md_core::{Workspace, target_hash};
use std::fs;
use tempfile::tempdir;

#[test]
fn repeated_saves_and_exports_create_no_bak_and_preserve_existing_bak() {
    let dir = tempdir().unwrap(); let path = dir.path().join("chapter.md"); let data = dir.path().join("data");
    fs::write(&path, "original").unwrap(); let old_bak = dir.path().join("chapter.md.editor-md-old.bak"); fs::write(&old_bak,"legacy backup").unwrap();
    let mut w = Workspace::new(data).unwrap(); let doc = w.open(&path).unwrap();
    for n in 0..8 { let result = w.save(&doc.id,format!("revision {n}"),None,None).unwrap(); assert!(result.warnings.is_empty()); }
    let target = dir.path().join("export.md");
    w.export_copy(&doc.id,"export 1".into(),target.clone(),None).unwrap();
    w.export_copy(&doc.id,"export 2".into(),target.clone(),target_hash(&target).unwrap()).unwrap();
    let backups = fs::read_dir(dir.path()).unwrap().flatten().filter(|e|e.path().extension().and_then(|x|x.to_str())==Some("bak")).collect::<Vec<_>>();
    assert_eq!(backups.len(),1); assert_eq!(fs::read_to_string(old_bak).unwrap(),"legacy backup");
    assert!(!fs::read_dir(dir.path()).unwrap().flatten().any(|e|e.file_name().to_string_lossy().starts_with(".sintaxtrama-replaced-")));
}

#[test]
fn pending_recovery_is_bounded_and_can_fall_back_after_corruption() {
    let dir = tempdir().unwrap(); let data = dir.path().join("data"); let id;
    { let mut w = Workspace::new(data.clone()).unwrap(); let doc = w.create(); id=doc.id;
      for n in 0..12 {w.checkpoint(&id,format!("revision {n}")).unwrap();} }
    let recovery = data.join("recovery"); assert_eq!(fs::read_dir(&recovery).unwrap().count(),3);
    fs::write(recovery.join(format!("{id}.json")),"corrupt").unwrap();
    let mut w = Workspace::new(data.clone()).unwrap(); assert!(w.restore().is_err());
    assert_eq!(w.documents[&id].text,"revision 10");
    assert_eq!(fs::read_to_string(recovery.join(format!("{id}.json"))).unwrap(),"corrupt");
    w.close(&id).unwrap(); assert_eq!(fs::read_dir(recovery).unwrap().count(),0);
}

#[test]
fn successful_save_removes_all_pending_generations_and_restart_restores_nothing() {
    let dir=tempdir().unwrap(); let data=dir.path().join("data"); let path=dir.path().join("new.md");
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.create();
     for n in 0..6 {w.checkpoint(&doc.id,format!("change {n}")).unwrap();}
     assert!(w.save(&doc.id,"saved".into(),Some(path),None).unwrap().warnings.is_empty());
     assert_eq!(fs::read_dir(data.join("recovery")).unwrap().count(),0);}
    assert!(Workspace::new(data).unwrap().restore().unwrap().is_empty());
}

#[test]
fn reload_archives_are_bounded_and_do_not_restore_discarded_edits() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("chapter.md");fs::write(&path,"base").unwrap();
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();
     for n in 0..8 {w.checkpoint(&doc.id,format!("discard {n}")).unwrap();w.reload(&doc.id).unwrap();}
     assert_eq!(fs::read_dir(data.join("recovery")).unwrap().count(),3);}
    assert!(Workspace::new(data).unwrap().restore().unwrap().is_empty());
}

#[test]
fn notes_follow_rename_and_move_with_same_stable_identity() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let first=dir.path().join("first.md");fs::write(&first,"base").unwrap();let note_id;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&first).unwrap();note_id=doc.note_id;w.save_note(&doc.id,"private note".into()).unwrap();}
    let renamed=dir.path().join("renamed.md");fs::rename(&first,&renamed).unwrap();
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&renamed).unwrap();assert_eq!(doc.note_id,note_id);assert_eq!(doc.note,"private note");}
    let folder=dir.path().join("folder");fs::create_dir(&folder).unwrap();let moved=folder.join("moved.txt");fs::rename(&renamed,&moved).unwrap();fs::write(&moved,"changed after move").unwrap();
    let mut w=Workspace::new(data).unwrap();let doc=w.open(&moved).unwrap();assert_eq!(doc.note_id,note_id);assert_eq!(doc.note,"private note");
}

#[test]
fn content_fallback_does_not_attach_notes_to_a_copy_while_original_exists() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let first=dir.path().join("first.md");let copied=dir.path().join("copy.md");fs::write(&first,"identical").unwrap();
    let mut w=Workspace::new(data).unwrap();let doc=w.open(&first).unwrap();w.save_note(&doc.id,"only original".into()).unwrap();fs::copy(&first,&copied).unwrap();
    let copy=w.open(&copied).unwrap();assert_ne!(copy.note_id,doc.note_id);assert_eq!(copy.note,"");
}

#[test]
fn copied_then_deleted_file_uses_unambiguous_content_fallback() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let first=dir.path().join("first.md");let moved=dir.path().join("moved.md");fs::write(&first,"same bytes").unwrap();let note_id;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&first).unwrap();note_id=doc.note_id;w.save_note(&doc.id,"move note".into()).unwrap();}
    fs::copy(&first,&moved).unwrap();fs::remove_file(&first).unwrap();
    let mut w=Workspace::new(data).unwrap();let doc=w.open(&moved).unwrap();assert_eq!(doc.note_id,note_id);assert_eq!(doc.note,"move note");
}

#[test]
fn save_as_forks_note_identity_and_preserves_both_notes_on_restart() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let first=dir.path().join("first.md");let second=dir.path().join("second.md");fs::write(&first,"base").unwrap();let old_id;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&first).unwrap();old_id=doc.note_id;w.save_note(&doc.id,"source note".into()).unwrap();
     let saved=w.save(&doc.id,"copy".into(),Some(second.clone()),None).unwrap();assert_ne!(saved.document.note_id,old_id);w.save_note(&doc.id,"copy note".into()).unwrap();}
    let mut w=Workspace::new(data).unwrap();let source=w.open(&first).unwrap();let copy=w.open(&second).unwrap();assert_eq!(source.note_id,old_id);assert_eq!(source.note,"source note");assert_eq!(copy.note,"copy note");
}

#[test]
fn stable_note_identity_survives_atomic_saves_and_subsequent_move() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("first.md");fs::write(&path,"base").unwrap();let identity;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();identity=doc.note_id;w.save_note(&doc.id,"note".into()).unwrap();
     for n in 0..5 {w.save(&doc.id,format!("revision {n}"),None,None).unwrap();}}
    let moved=dir.path().join("moved.md");fs::rename(path,&moved).unwrap();
    let mut w=Workspace::new(data).unwrap();let doc=w.open(&moved).unwrap();assert_eq!(doc.note_id,identity);assert_eq!(doc.note,"note");
}

#[test]
fn path_based_015_note_and_old_recovery_migrate_without_deleting_originals() {
    use sha2::{Digest,Sha256};
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("first.md");fs::write(&path,"base").unwrap();
    fs::create_dir_all(data.join("notes")).unwrap();let canonical=fs::canonicalize(&path).unwrap();let hash=format!("{:x}",Sha256::digest(canonical.to_string_lossy().as_bytes()));let legacy=data.join("notes").join(format!("{hash}.json"));
    let record=serde_json::to_vec(&serde_json::json!({"version":1,"revision":7,"text":"legacy note"})).unwrap();fs::write(&legacy,&record).unwrap();
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();assert_eq!(doc.note,"legacy note");assert_eq!(doc.note_revision,7);
     w.checkpoint(&doc.id,"pending old".into()).unwrap();let recovery=data.join("recovery").join(format!("{}.json",doc.id));let mut json:serde_json::Value=serde_json::from_slice(&fs::read(&recovery).unwrap()).unwrap();json.as_object_mut().unwrap().remove("noteId");fs::write(recovery,serde_json::to_vec(&json).unwrap()).unwrap();}
    let mut w=Workspace::new(data).unwrap();let docs=w.restore().unwrap();assert_eq!(docs[0].note,"legacy note");assert!(!docs[0].note_id.is_empty());assert_eq!(fs::read(legacy).unwrap(),record);
}

#[cfg(windows)]
#[test]
fn index_write_failure_after_save_retains_new_note_identity_and_recovers_on_retry() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("first.md");let target=dir.path().join("second.md");fs::write(&path,"base").unwrap();let new_note_id;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();w.save_note(&doc.id,"important note".into()).unwrap();
     let locked=fs::OpenOptions::new().read(true).share_mode(0).open(data.join("note-identities.json")).unwrap();
     let saved=w.save(&doc.id,"new text".into(),Some(target.clone()),None).unwrap();assert!(!saved.warnings.is_empty());assert!(saved.document.metadata_pending);new_note_id=saved.document.note_id;drop(locked);}
    let mut w=Workspace::new(data.clone()).unwrap();let docs=w.restore().unwrap();assert_eq!(docs[0].note_id,new_note_id);assert_eq!(docs[0].note,"important note");assert_eq!(docs[0].base_text,"new text");
    let result=w.save(&docs[0].id,docs[0].text.clone(),None,None).unwrap();assert!(result.warnings.is_empty());drop(w);
    let mut w=Workspace::new(data).unwrap();let doc=w.open(&target).unwrap();assert_eq!(doc.note_id,new_note_id);assert_eq!(doc.note,"important note");
}

#[test]
fn ambiguous_content_fallback_never_guesses_an_old_note() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let first=dir.path().join("first.md");let second=dir.path().join("second.md");let moved=dir.path().join("moved.md");
    fs::write(&first,"same bytes").unwrap();fs::write(&second,"same bytes").unwrap();
    {let mut w=Workspace::new(data.clone()).unwrap();let a=w.open(&first).unwrap();let b=w.open(&second).unwrap();w.save_note(&a.id,"first note".into()).unwrap();w.save_note(&b.id,"second note".into()).unwrap();}
    fs::copy(&first,&moved).unwrap();fs::remove_file(&first).unwrap();fs::remove_file(&second).unwrap();
    let mut w=Workspace::new(data).unwrap();assert_eq!(w.open(&moved).unwrap().note,"");
}

#[cfg(windows)]
#[test]
fn failed_checkpoint_never_overwrites_the_only_valid_fallback() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir=tempdir().unwrap();let data=dir.path().join("data");let id;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.create();id=doc.id;
     for n in 0..3 {w.checkpoint(&id,format!("revision {n}")).unwrap();}}
    let current=data.join("recovery").join(format!("{id}.json"));let first=current.with_extension("slot1");let fallback=current.with_extension("slot2");let valid_bytes=fs::read(&fallback).unwrap();
    fs::write(&current,"corrupt current").unwrap();fs::write(&first,"corrupt slot").unwrap();
    let mut w=Workspace::new(data.clone()).unwrap();assert!(w.restore().is_err());assert_eq!(w.documents[&id].text,"revision 0");
    let locked=fs::OpenOptions::new().read(true).share_mode(1).open(&current).unwrap();
    assert!(w.checkpoint(&id,"new pending".into()).is_err());assert_eq!(fs::read(&fallback).unwrap(),valid_bytes);drop(locked);drop(w);
    let mut w=Workspace::new(data).unwrap();assert!(w.restore().is_err());assert_eq!(w.documents[&id].text,"revision 0");
}

#[test]
fn identical_checkpoint_does_not_rotate_away_the_oldest_distinct_generation() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let mut w=Workspace::new(data.clone()).unwrap();let doc=w.create();
    for n in 0..3 {w.checkpoint(&doc.id,format!("revision {n}")).unwrap();}
    let oldest=data.join("recovery").join(format!("{}.slot2",doc.id));let previous=fs::read(&oldest).unwrap();
    for _ in 0..4 {w.checkpoint(&doc.id,"revision 2".into()).unwrap();}
    assert_eq!(fs::read(oldest).unwrap(),previous);
}

#[test]
fn corrupt_note_index_does_not_block_draft_recovery_or_overwrite_the_index() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("chapter.md");fs::write(&path,"base").unwrap();
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();w.save_note(&doc.id,"protected note".into()).unwrap();w.checkpoint(&doc.id,"pending draft".into()).unwrap();}
    let index=data.join("note-identities.json");fs::write(&index,"corrupt index").unwrap();
    let mut w=Workspace::new(data.clone()).unwrap();assert!(w.restore().is_err());let doc=w.documents.values().next().unwrap().clone();assert_eq!(doc.text,"pending draft");assert_eq!(doc.note,"protected note");
    let outcome=w.save(&doc.id,doc.text,None,None).unwrap();assert!(outcome.document.metadata_pending);assert!(!outcome.warnings.is_empty());assert_eq!(fs::read_to_string(&index).unwrap(),"corrupt index");assert!(data.join("recovery").join(format!("{}.json",doc.id)).exists());
}

#[test]
fn strong_file_identity_wins_over_a_stale_path_association() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let first=dir.path().join("first.md");let second=dir.path().join("second.md");fs::write(&first,"first").unwrap();fs::write(&second,"second").unwrap();let first_identity;
    {let mut w=Workspace::new(data.clone()).unwrap();let a=w.open(&first).unwrap();let b=w.open(&second).unwrap();first_identity=a.note_id;w.save_note(&a.id,"first note".into()).unwrap();w.save_note(&b.id,"second note".into()).unwrap();}
    fs::remove_file(&second).unwrap();fs::rename(&first,&second).unwrap();
    let mut w=Workspace::new(data).unwrap();let doc=w.open(&second).unwrap();assert_eq!(doc.note_id,first_identity);assert_eq!(doc.note,"first note");
}

#[test]
fn reload_after_fallback_archives_the_actual_recovered_draft() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("chapter.md");fs::write(&path,"base").unwrap();let id;
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();id=doc.id;for n in 0..3 {w.checkpoint(&id,format!("revision {n}")).unwrap();}}
    let current=data.join("recovery").join(format!("{id}.json"));fs::write(&current,"corrupt current").unwrap();fs::write(current.with_extension("slot1"),"corrupt prior").unwrap();
    let mut w=Workspace::new(data).unwrap();assert!(w.restore().is_err());assert_eq!(w.documents[&id].text,"revision 0");let archive=current.with_file_name(format!("{}.reload1",w.documents[&id].note_id));w.reload(&id).unwrap();
    let archived:serde_json::Value=serde_json::from_slice(&fs::read(archive).unwrap()).unwrap();assert_eq!(archived["text"],"revision 0");
}

#[test]
fn duplicate_note_bindings_fail_closed_without_blocking_recovery() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("chapter.md");fs::write(&path,"base").unwrap();
    {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();w.save_note(&doc.id,"protected note".into()).unwrap();w.checkpoint(&doc.id,"pending draft".into()).unwrap();}
    let index=data.join("note-identities.json");let mut record:serde_json::Value=serde_json::from_slice(&fs::read(&index).unwrap()).unwrap();let entry=record["bindings"][0].clone();record["bindings"].as_array_mut().unwrap().push(entry);let corrupt=serde_json::to_vec(&record).unwrap();fs::write(&index,&corrupt).unwrap();
    let mut w=Workspace::new(data).unwrap();assert!(w.restore().is_err());let doc=w.documents.values().next().unwrap().clone();assert_eq!(doc.text,"pending draft");assert_eq!(doc.note,"protected note");assert!(w.open(&path).is_ok());
    let saved=w.save(&doc.id,doc.text,None,None).unwrap();assert!(!saved.warnings.is_empty());assert_eq!(fs::read(index).unwrap(),corrupt);
}

#[test]
fn reload_archive_bound_survives_reopening_the_same_document_in_new_sessions() {
    let dir=tempdir().unwrap();let data=dir.path().join("data");let path=dir.path().join("chapter.md");fs::write(&path,"base").unwrap();
    for n in 0..8 {let mut w=Workspace::new(data.clone()).unwrap();let doc=w.open(&path).unwrap();w.checkpoint(&doc.id,format!("discard {n}")).unwrap();w.reload(&doc.id).unwrap();}
    assert_eq!(fs::read_dir(data.join("recovery")).unwrap().count(),3);
}
