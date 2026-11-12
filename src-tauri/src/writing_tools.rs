use serde::Serialize;

#[derive(Serialize)]
pub struct Spelling { pub from: u32, pub to: u32, pub word: String, pub suggestions: Vec<String> }
#[derive(Serialize)]
pub struct SpellResult { pub language: Option<String>, pub issues: Vec<Spelling>, pub warning: Option<String> }

#[cfg(windows)]
pub fn fonts() -> Result<Vec<String>, String> {
    use windows::Win32::Graphics::DirectWrite::*;
    let result = unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED).map_err(|e| e.to_string())?;
        let mut collection = None;
        factory.GetSystemFontCollection(&mut collection, false).map_err(|e| e.to_string())?;
        let collection = collection.ok_or("No hay colección de fuentes")?;
        let mut fonts = Vec::new();
        for index in 0..collection.GetFontFamilyCount() {
            let names = collection.GetFontFamily(index).and_then(|family| family.GetFamilyNames()).map_err(|e| e.to_string())?;
            let length = names.GetStringLength(0).map_err(|e| e.to_string())?;
            let mut value = vec![0u16; length as usize + 1];
            names.GetString(0, &mut value).map_err(|e| e.to_string())?;
            fonts.push(String::from_utf16_lossy(&value[..length as usize]));
        }
        fonts.sort_by_key(|s| s.to_lowercase()); fonts.dedup(); fonts
    };
    Ok(result)
}

#[cfg(windows)]
pub fn spell(text: &str) -> Result<SpellResult, String> {
    use windows::{core::{HSTRING, PWSTR}, Win32::{Foundation::RPC_E_CHANGED_MODE, Globalization::*, System::Com::*}};
    if text.chars().count() > 100_000 || text.contains('\0') { return Err("Revise hasta 100.000 caracteres sin caracteres nulos.".into()); }
    // Every COM object stays on this worker and drops before CoUninitialize.
    struct Apartment(bool);
    impl Drop for Apartment { fn drop(&mut self) { if self.0 { unsafe { CoUninitialize(); } } } }
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    // A dialog or another component may already own a valid STA on this worker.
    // Reuse that apartment without decrementing its COM initialization count.
    if initialized != RPC_E_CHANGED_MODE { initialized.ok().map_err(|e| e.to_string())?; }
    let _apartment = Apartment(initialized.is_ok());
    unsafe {
        let factory: ISpellCheckerFactory = CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let language = ["es-CL", "es-ES", "es-MX"].into_iter().find(|tag| factory.IsSupported(&HSTRING::from(*tag)).map(|b| b.as_bool()).unwrap_or(false));
        let Some(language) = language else { return Ok(SpellResult { language: None, issues: vec![], warning: Some("Windows no tiene un corrector de español disponible. Instale el paquete de idioma español en Configuración de Windows. Las reglas básicas siguen disponibles.".into()) }); };
        let checker = factory.CreateSpellChecker(&HSTRING::from(language)).map_err(|e| e.to_string())?;
        let errors = checker.Check(&HSTRING::from(text)).map_err(|e| e.to_string())?;
        let utf16: Vec<u16> = text.encode_utf16().collect();
        let mut issues = Vec::new();
        while issues.len() < 100 {
            let mut error = None;
            let status = errors.Next(&mut error);
            status.ok().map_err(|e| e.to_string())?;
            let Some(error) = error else { break; };
            let from = error.StartIndex().map_err(|e| e.to_string())?;
            let to = from.saturating_add(error.Length().map_err(|e| e.to_string())?);
            if to as usize > utf16.len() || from >= to { continue; }
            let word = String::from_utf16_lossy(&utf16[from as usize..to as usize]);
            let action = error.CorrectiveAction().map_err(|e| e.to_string())?;
            let mut suggestions = Vec::new();
            if action == CORRECTIVE_ACTION_DELETE { suggestions.push(String::new()); }
            else if action == CORRECTIVE_ACTION_REPLACE {
                let pointer = error.Replacement().map_err(|e| e.to_string())?;
                let value = pointer.to_string(); CoTaskMemFree(Some(pointer.0.cast()));
                suggestions.push(value.map_err(|e| e.to_string())?);
            } else if action == CORRECTIVE_ACTION_GET_SUGGESTIONS {
                let values = checker.Suggest(&HSTRING::from(&word)).map_err(|e| e.to_string())?;
                for _ in 0..5 {
                    let mut pointers = [PWSTR::null()]; let mut fetched = 0;
                    let status = values.Next(&mut pointers, Some(&mut fetched));
                    status.ok().map_err(|e| e.to_string())?;
                    if fetched == 0 { break; }
                    let value = pointers[0].to_string(); CoTaskMemFree(Some(pointers[0].0.cast()));
                    suggestions.push(value.map_err(|e| e.to_string())?);
                }
            } else { continue; }
            issues.push(Spelling { from, to, word, suggestions });
        }
        Ok(SpellResult { language: Some(language.into()), issues, warning: None })
    }
}

#[cfg(not(windows))]
pub fn fonts() -> Result<Vec<String>, String> { Err("Las fuentes instaladas requieren Windows.".into()) }
#[cfg(not(windows))]
pub fn spell(_: &str) -> Result<SpellResult, String> { Err("La ortografía de Windows no está disponible.".into()) }

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn accepts_an_existing_sta_apartment() {
        use windows::Win32::System::Com::*;
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().unwrap(); }
        let result = spell("La ciudad está tranquila.");
        unsafe { CoUninitialize(); }
        assert!(result.is_ok(), "Existing apartment failed: {:?}", result.err());
    }
    #[test]
    fn enumerate_real_fonts() { let fonts = fonts().unwrap(); println!("Installed font families: {}", fonts.len()); assert!(fonts.iter().any(|s| s == "Segoe UI")); }
    #[test]
    fn real_spellchecker_preserves_unicode_offsets() {
        let result = spell("😀 La ciudadd está tranquila.").unwrap();
        println!("Spanish dictionary: {:?}; detected issues: {}", result.language, result.issues.len());
        if result.language.is_some() {
            assert!(result.issues.iter().any(|issue| issue.word == "ciudadd" && issue.from == 6));
        } else { assert!(result.warning.is_some()); }
    }
    #[test]
    fn rejects_oversize_or_null_input() { assert!(spell("a\0b").is_err()); assert!(spell(&"a".repeat(100001)).is_err()); }
}
