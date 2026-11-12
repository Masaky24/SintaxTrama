use sha2::{Digest, Sha256};
use std::{fs::{self, File}, io::{Read, Write}, path::Path};
use tempfile::NamedTempFile;
pub const MAX_BYTES: u64 = 20 * 1024 * 1024;
pub fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub fn read(path: &Path) -> Result<Vec<u8>, String> {
    read_limited(path, MAX_BYTES)
}
pub fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let mut file = File::open(path).map_err(|e| format!("No se pudo abrir el archivo: {e}"))?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() { return Err("La ruta no es un archivo.".into()); }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file).take(limit + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit { return Err("El archivo supera el límite admitido.".into()); }
    Ok(bytes)
}
pub fn atomic_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp = NamedTempFile::new_in(path.parent().ok_or("Ruta sin carpeta")?).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
// The temporary file shares the destination volume. Never truncate a manuscript.
// An owned temporary captures the exact displaced file for race detection.
// Successful saves remove it; conflicts retain it for explicit recovery.
pub fn replace(path: &Path, bytes: &[u8], expected: Option<&str>) -> Result<(), String> {
    replace_after_check(path, bytes, expected, || {})
}
fn replace_after_check(path: &Path, bytes: &[u8], expected: Option<&str>, after_check: impl FnOnce()) -> Result<(), String> {
    if bytes.len() as u64 > MAX_BYTES { return Err("El documento supera 20 MiB.".into()); }
    let before = if path.exists() { Some(read(path)?) } else { None };
    if before.as_ref().map(|b| hash(b)).as_deref() != expected {
        return Err("CONFLICTO: el archivo cambió o desapareció fuera del editor. Recargue o guarde una copia con otro nombre.".into());
    }
    if fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return Err("No se reemplazan enlaces simbólicos.".into());
    }
    let mut tmp = NamedTempFile::new_in(path.parent().ok_or("Ruta sin carpeta")?).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    let tmp = tmp.into_temp_path();
    if let Some(original) = before {
        if hash(&read(path)?) != expected.unwrap_or_default() { return Err("CONFLICTO: cambio externo durante el guardado.".into()); }
        after_check();
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
            let wide = |p: &Path| p.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<u16>>();
            let displaced = tempfile::Builder::new().prefix(".sintaxtrama-replaced-").suffix(".tmp").tempfile_in(path.parent().ok_or("Ruta sin carpeta")?).map_err(|e| e.to_string())?;
            let displaced = displaced.into_temp_path();
            // ReplaceFileW requires an unused backup name. Keep ownership of the path.
            fs::remove_file(&displaced).map_err(|e| e.to_string())?;
            let (target, source, old) = (wide(path), wide(&tmp), wide(&displaced));
            let ok = unsafe { ReplaceFileW(target.as_ptr(), source.as_ptr(), old.as_ptr(), 0, std::ptr::null(), std::ptr::null()) };
            if ok == 0 {
                let error = std::io::Error::last_os_error();
                let retained = if displaced.exists() { Some(displaced.keep().map_err(|e| e.to_string())?) } else { None };
                return Err(format!("No se pudo reemplazar el archivo. Se conserva la recuperacion. {error}. Temporal preservado: {retained:?}"));
            }
            // Compare the exact displaced bytes, including a racing external edit.
            let displaced_bytes = match read(&displaced) {
                Ok(bytes) => bytes,
                Err(error) => {
                    let retained = displaced.keep().map_err(|e| e.to_string())?;
                    return Err(format!("No se pudo verificar el guardado: {error}. Temporal preservado en {}.", retained.display()));
                }
            };
            if hash(&displaced_bytes) != hash(&original) {
                let retained = displaced.keep().map_err(|e| e.to_string())?;
                return Err(format!("CONFLICTO concurrente: la version externa quedo en {}. El texto del editor esta en el destino y en recuperacion. Revise ambas copias.", retained.display()));
            }
        }
        #[cfg(not(windows))]
        {
            let _ = original;
            tmp.persist(path).map_err(|e| e.to_string())?;
        }
    } else {
        tmp.persist_noclobber(path).map_err(|e| format!("No se creó el archivo; el destino podría existir ya: {e}"))?;
    }
    Ok(())
}

// Identity survives rename and same-volume moves. Content fingerprints are only
// a fallback for a uniquely identified moved file whose former path is gone.
pub fn file_identity(path: &Path) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION};
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, &mut info) } == 0 { return Err(std::io::Error::last_os_error().to_string()); }
        Ok(Some(format!("windows:{:08x}:{:08x}{:08x}", info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow)))
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        Ok(Some(format!("unix:{}:{}", metadata.dev(), metadata.ino())))
    }
    #[cfg(not(any(windows, unix)))]
    { let _ = path; Ok(None) }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn racing_external_edit_is_preserved_without_bak() {
        let dir = tempfile::tempdir().unwrap(); let target = dir.path().join("chapter.md");
        fs::write(&target, b"baseline").unwrap(); let expected = hash(b"baseline");
        let writer = target.clone();
        let error = replace_after_check(&target, b"editor changes", Some(&expected), move || {
            std::thread::spawn(move || fs::write(writer, b"external race").unwrap()).join().unwrap();
        }).unwrap_err();
        assert!(error.contains("CONFLICTO concurrente"));
        assert_eq!(fs::read(&target).unwrap(), b"editor changes");
        let retained = fs::read_dir(dir.path()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(".sintaxtrama-replaced-")).collect::<Vec<_>>();
        assert_eq!(retained.len(), 1); assert_eq!(fs::read(retained[0].path()).unwrap(), b"external race");
        assert!(!fs::read_dir(dir.path()).unwrap().flatten().any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("bak")));
    }
}
