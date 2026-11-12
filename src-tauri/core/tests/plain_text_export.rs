use editor_md_core::{plain_text::markdown_to_text, Workspace};
use std::fs;
use tempfile::tempdir;

#[test]
fn paragraphs_headings_inline_marks_entities_and_escapes() {
    assert_eq!(markdown_to_text("# Título\n\nUn **árbol** y *sol*, ~~antes~~ y `x_y`.\n\nA &amp; B, \\*literal\\* y <u>subrayado</u>."), "Título\n\nUn árbol y sol, antes y x_y.\n\nA & B, *literal* y subrayado.\n");
}
#[test]
fn links_images_references_and_breaks() {
    assert_eq!(markdown_to_text("[Sitio][web] e ![Imagen](foto.png)\nsegunda  \ntercera\n\n[web]: https://example.org"), "Sitio e Imagen\nsegunda\ntercera\n");
}
#[test]
fn code_content_is_not_stripped_as_markdown() {
    assert_eq!(markdown_to_text("```cpp\n// # **literal**\nint a_b = 1;\n```\n\nFinal"), "// # **literal**\nint a_b = 1;\n\nFinal\n");
}
#[test]
fn loose_and_nested_lists_retain_paragraph_boundaries_and_markers() {
    assert_eq!(markdown_to_text("- uno\n\n  párrafo\n\n- dos"), "- uno\n\npárrafo\n\n- dos\n");
    assert_eq!(markdown_to_text("- padre\n  - hijo\n- otro"), "- padre\n  - hijo\n- otro\n");
}
#[test]
fn lists_quotes_tables_and_separators_keep_boundaries() {
    let text = markdown_to_text("> Cita\n\n- uno\n- dos\n\n3. tercero\n4. cuarto\n\n---\n\n| A | B |\n|---|---|\n| x | y |\n\n- [x] Hecho");
    assert_eq!(text, "Cita\n\n- uno\n- dos\n\n3. tercero\n4. cuarto\n\nA\tB\nx\ty\n\n- [x] Hecho\n");
}
#[test]
fn txt_export_converts_only_markdown_without_altering_source_or_pending_text() {
    let temp = tempdir().unwrap(); let source = temp.path().join("capitulo.md");
    fs::write(&source, "# Original\n").unwrap();
    let mut workspace = Workspace::new(temp.path().join("data")).unwrap();
    let document = workspace.open(&source).unwrap();
    let edited = "# Pendiente\n\nTexto **nuevo**.";
    let target = temp.path().join("copia.TXT");
    workspace.export_copy(&document.id, edited.into(), target.clone(), None).unwrap();
    assert_eq!(fs::read_to_string(source).unwrap(), "# Original\n");
    assert_eq!(fs::read_to_string(target).unwrap(), "Pendiente\n\nTexto nuevo.\n");
    assert_eq!(workspace.documents[&document.id].text, edited);
    assert_eq!(workspace.documents[&document.id].base_text, "# Original\n");
    let md = temp.path().join("copia.md");
    workspace.export_copy(&document.id, edited.into(), md.clone(), None).unwrap();
    assert_eq!(fs::read_to_string(md).unwrap(), edited);
}
#[test]
fn plain_txt_source_retains_literal_markdown_characters() {
    let temp = tempdir().unwrap(); let source = temp.path().join("notas.txt");
    fs::write(&source, "# literal **sin formato**").unwrap();
    let mut workspace = Workspace::new(temp.path().join("data")).unwrap();
    let document = workspace.open(&source).unwrap(); let target = temp.path().join("copia.txt");
    workspace.export_copy(&document.id, document.text.clone(), target.clone(), None).unwrap();
    assert_eq!(fs::read_to_string(target).unwrap(), document.text);
}
