use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Format {
    pub encoding: String,
    pub eol: String,
}

impl Default for Format {
    fn default() -> Self {
        Self { encoding: "UTF-8".into(), eol: "CRLF".into() }
    }
}

pub fn decode(bytes: &[u8]) -> Result<(String, Format), String> {
    let (text, encoding) = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let le = bytes[0] == 0xff;
        if (bytes.len() - 2) % 2 != 0 { return Err("UTF-16 incompleto; no se abrió el archivo.".into()); }
        let units: Vec<u16> = bytes[2..].chunks_exact(2).map(|b| {
            if le { u16::from_le_bytes([b[0], b[1]]) } else { u16::from_be_bytes([b[0], b[1]]) }
        }).collect();
        (String::from_utf16(&units).map_err(|_| "UTF-16 inválido; no se convirtió el archivo.")?,
            if le { "UTF-16 LE" } else { "UTF-16 BE" })
    } else {
        let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
        (String::from_utf8(if bom { bytes[3..].to_vec() } else { bytes.to_vec() })
            .map_err(|_| "Codificación no admitida. Se admite UTF-8 y UTF-16 con BOM; el original permanece intacto.")?,
            if bom { "UTF-8 BOM" } else { "UTF-8" })
    };
    if text.contains('\0') { return Err("El archivo contiene caracteres nulos; podría ser binario o UTF-16 sin BOM.".into()); }
    let crlf = text.matches("\r\n").count();
    let cr = text.matches('\r').count() - crlf;
    let lf = text.matches('\n').count() - crlf;
    let kinds = [crlf, cr, lf].iter().filter(|&&n| n > 0).count();
    let eol = if kinds > 1 { "Mixto" } else if crlf > 0 { "CRLF" } else if cr > 0 { "CR" } else { "LF" };
    Ok((text.replace("\r\n", "\n").replace('\r', "\n"), Format { encoding: encoding.into(), eol: eol.into() }))
}

pub fn encode(text: &str, format: &Format) -> Result<Vec<u8>, String> {
    let separator = match format.eol.as_str() {
        "CRLF" => "\r\n", "CR" => "\r", "LF" => "\n",
        _ => return Err("Saltos de línea mixtos: use Guardar como para crear una copia normalizada a LF.".into()),
    };
    let text = text.replace("\r\n", "\n").replace('\r', "\n").replace('\n', separator);
    if text.contains('\0') { return Err("No se guardan caracteres nulos.".into()); }
    let mut bytes = Vec::new();
    match format.encoding.as_str() {
        "UTF-8" => bytes.extend(text.as_bytes()),
        "UTF-8 BOM" => { bytes.extend([0xef, 0xbb, 0xbf]); bytes.extend(text.as_bytes()); }
        "UTF-16 LE" | "UTF-16 BE" => {
            let le = format.encoding == "UTF-16 LE";
            bytes.extend(if le { [0xff, 0xfe] } else { [0xfe, 0xff] });
            for unit in text.encode_utf16() { bytes.extend(if le { unit.to_le_bytes() } else { unit.to_be_bytes() }); }
        }
        _ => return Err("Codificación no admitida; no se guardó.".into()),
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_supported_formats() {
        for encoding in ["UTF-8", "UTF-8 BOM", "UTF-16 LE", "UTF-16 BE"] {
            for eol in ["LF", "CRLF", "CR"] {
                let format = Format { encoding: encoding.into(), eol: eol.into() };
                let bytes = encode("Árbol 😀\nfin\n", &format).unwrap();
                let (text, actual) = decode(&bytes).unwrap();
                assert_eq!(text, "Árbol 😀\nfin\n"); assert_eq!(format, actual);
                assert_eq!(bytes, encode(&text, &actual).unwrap());
            }
        }
    }
    #[test]
    fn reject_lossy_input() {
        for bytes in [&[0xff, 0x61][..], &[0xff, 0xfe, 0x00][..], &[0xff, 0xfe, 0x00, 0xd8][..], &[0, 65][..]] {
            assert!(decode(bytes).is_err());
        }
    }
    #[test]
    fn mixed_is_not_silently_normalized() {
        let (_, format) = decode(b"a\r\nb\nc\r").unwrap();
        assert_eq!(format.eol, "Mixto"); assert!(encode("changed", &format).is_err());
    }
}
