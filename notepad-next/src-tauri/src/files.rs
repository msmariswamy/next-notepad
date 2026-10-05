//! File I/O for the editor: decode on open, encode on save, atomic writes.
//!
//! Text crosses the IPC boundary normalised to `\n`; the file's original line
//! ending and encoding travel alongside as metadata so a save round-trips them
//! (spec: editor-core "Preserve encoding and line endings").

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Eol {
    Lf,
    Crlf,
    Cr,
}

impl Eol {
    fn as_str(self) -> &'static str {
        match self {
            Eol::Lf => "\n",
            Eol::Crlf => "\r\n",
            Eol::Cr => "\r",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoadedFile {
    /// Text normalised to `\n` line endings.
    pub text: String,
    /// Encoding label understood by `encoding_rs` (e.g. "UTF-8", "UTF-16LE").
    pub encoding: String,
    pub bom: bool,
    pub eol: Eol,
}

/// Pick the dominant line ending; ties and no line breaks default to LF.
pub fn detect_eol(text: &str) -> Eol {
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count() - crlf;
    let cr = text.matches('\r').count() - crlf;
    if crlf > lf && crlf >= cr {
        Eol::Crlf
    } else if cr > lf && cr > crlf {
        Eol::Cr
    } else {
        Eol::Lf
    }
}

pub fn normalize_eol(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

/// Detect the encoding: BOM first, then UTF-8 validity, else Windows-1252.
pub fn decode(bytes: &[u8]) -> LoadedFile {
    let (encoding, bom) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (encoding_rs::UTF_8, true)
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        (encoding_rs::UTF_16LE, true)
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        (encoding_rs::UTF_16BE, true)
    } else if std::str::from_utf8(bytes).is_ok() {
        (encoding_rs::UTF_8, false)
    } else {
        (encoding_rs::WINDOWS_1252, false)
    };
    // `decode_with_bom_removal` strips the BOM for the matching encoding.
    let (text, _) = encoding.decode_with_bom_removal(bytes);
    let eol = detect_eol(&text);
    LoadedFile {
        text: normalize_eol(&text),
        encoding: encoding.name().to_string(),
        bom,
        eol,
    }
}

/// Encode text for saving, restoring line endings and any BOM.
pub fn encode(text: &str, encoding: &str, bom: bool, eol: Eol) -> Result<Vec<u8>, String> {
    let enc = encoding_rs::Encoding::for_label(encoding.as_bytes())
        .ok_or_else(|| format!("unknown encoding: {encoding}"))?;
    let with_eol = text.replace('\n', eol.as_str());
    let mut out = Vec::new();
    if bom {
        if enc == encoding_rs::UTF_8 {
            out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        } else if enc == encoding_rs::UTF_16LE {
            out.extend_from_slice(&[0xFF, 0xFE]);
        } else if enc == encoding_rs::UTF_16BE {
            out.extend_from_slice(&[0xFE, 0xFF]);
        }
    }
    if enc == encoding_rs::UTF_16LE {
        out.extend(with_eol.encode_utf16().flat_map(|u| u.to_le_bytes()));
    } else if enc == encoding_rs::UTF_16BE {
        out.extend(with_eol.encode_utf16().flat_map(|u| u.to_be_bytes()));
    } else {
        // encoding_rs encodes UTF-8 and legacy single-byte encodings directly.
        let (bytes, _, had_unmappable) = enc.encode(&with_eol);
        if had_unmappable {
            return Err(format!("text contains characters not representable in {encoding}"));
        }
        out.extend_from_slice(&bytes);
    }
    Ok(out)
}

pub fn read_file(path: &Path) -> Result<LoadedFile, String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(decode(&bytes))
}

/// Write via temp file + rename so a crash never leaves a half-written target.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    // NamedTempFile is created 0600; keep the target's existing permissions.
    if let Ok(meta) = fs::metadata(path) {
        fs::set_permissions(tmp.path(), meta.permissions()).map_err(|e| e.to_string())?;
    }
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

pub fn save_file(path: &Path, text: &str, encoding: &str, bom: bool, eol: Eol) -> Result<(), String> {
    let bytes = encode(text, encoding, bom, eol)?;
    atomic_write(path, &bytes)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<LoadedFile, String> {
    read_file(Path::new(&path))
}

#[tauri::command]
pub fn save_file_cmd(path: String, text: String, encoding: String, bom: bool, eol: Eol) -> Result<(), String> {
    save_file(Path::new(&path), &text, &encoding, bom, eol)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_plain_utf8_lf() {
        let f = decode(b"hello\nworld");
        assert_eq!(f.text, "hello\nworld");
        assert_eq!(f.encoding, "UTF-8");
        assert!(!f.bom);
        assert_eq!(f.eol, Eol::Lf);
    }

    #[test]
    fn detects_utf8_bom_and_strips_it() {
        let f = decode(&[0xEF, 0xBB, 0xBF, b'a']);
        assert_eq!(f.text, "a");
        assert!(f.bom);
        assert_eq!(f.encoding, "UTF-8");
    }

    #[test]
    fn detects_utf16le_bom() {
        let f = decode(&[0xFF, 0xFE, b'h', 0, b'i', 0]);
        assert_eq!(f.text, "hi");
        assert_eq!(f.encoding, "UTF-16LE");
        assert!(f.bom);
    }

    #[test]
    fn detects_utf16be_bom() {
        let f = decode(&[0xFE, 0xFF, 0, b'h', 0, b'i']);
        assert_eq!(f.text, "hi");
        assert_eq!(f.encoding, "UTF-16BE");
    }

    #[test]
    fn falls_back_to_windows_1252_for_invalid_utf8() {
        let f = decode(&[b'c', b'a', b'f', 0xE9]);
        assert_eq!(f.text, "café");
        assert_eq!(f.encoding, "windows-1252");
    }

    #[test]
    fn detects_crlf_and_normalises_text() {
        let f = decode(b"a\r\nb\r\nc");
        assert_eq!(f.eol, Eol::Crlf);
        assert_eq!(f.text, "a\nb\nc");
    }

    #[test]
    fn detects_classic_mac_cr() {
        let f = decode(b"a\rb\rc");
        assert_eq!(f.eol, Eol::Cr);
        assert_eq!(f.text, "a\nb\nc");
    }

    #[test]
    fn mixed_endings_pick_the_dominant_one() {
        assert_eq!(detect_eol("a\r\nb\r\nc\nd"), Eol::Crlf);
        assert_eq!(detect_eol("a\nb\nc\r\nd"), Eol::Lf);
    }

    #[test]
    fn no_line_breaks_defaults_to_lf() {
        assert_eq!(detect_eol("single line"), Eol::Lf);
    }

    #[test]
    fn encode_restores_crlf_and_bom() {
        let bytes = encode("a\nb", "UTF-8", true, Eol::Crlf).unwrap();
        assert_eq!(bytes, [0xEF, 0xBB, 0xBF, b'a', b'\r', b'\n', b'b']);
    }

    #[test]
    fn encode_utf16le_with_bom() {
        let bytes = encode("hi", "UTF-16LE", true, Eol::Lf).unwrap();
        assert_eq!(bytes, [0xFF, 0xFE, b'h', 0, b'i', 0]);
    }

    #[test]
    fn encode_rejects_unrepresentable_characters() {
        assert!(encode("日本", "windows-1252", false, Eol::Lf).is_err());
    }

    #[test]
    fn encode_rejects_unknown_encoding() {
        assert!(encode("a", "not-an-encoding", false, Eol::Lf).is_err());
    }

    #[test]
    fn roundtrip_crlf_utf8_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f.txt");
        fs::write(&path, b"one\r\ntwo\r\n").unwrap();

        let loaded = read_file(&path).unwrap();
        let edited = format!("{}three\n", loaded.text);
        save_file(&path, &edited, &loaded.encoding, loaded.bom, loaded.eol).unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"one\r\ntwo\r\nthree\r\n");
    }

    #[test]
    fn save_creates_a_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.txt");
        save_file(&path, "x", "UTF-8", false, Eol::Lf).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"x");
    }

    #[test]
    fn atomic_write_replaces_existing_content_and_leaves_no_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f.txt");
        fs::write(&path, b"old old old").unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_existing_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f.sh");
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o755);
    }

    #[test]
    fn open_missing_file_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_file(&dir.path().join("nope.txt")).is_err());
    }
}

/// Move an unreadable store file aside as `<name>.corrupt` instead of deleting it,
/// so the user can still inspect it. An older `.corrupt` file is overwritten.
pub fn quarantine_corrupt(path: &Path) -> Result<(), String> {
    let mut name = path.file_name().ok_or("path has no file name")?.to_os_string();
    name.push(".corrupt");
    fs::rename(path, path.with_file_name(name)).map_err(|e| e.to_string())
}
