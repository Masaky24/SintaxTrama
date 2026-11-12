fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "bootstrap", "open_pending", "new_document", "open_document", "open_path", "open_folder", "list_folder", "remove_folder", "save_note", "system_fonts", "spell_check", "save_document", "export_document", "checkpoint", "check_external", "reload_document", "close_document", "confirm_discard",
        ]),
    )).expect("No se pudo generar la configuración Tauri");
}
