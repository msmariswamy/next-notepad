//! Saved macros persisted as one versioned JSON file in the app-data directory (spec: macro-recording, ADR-0006).
//!
//! The frontend owns the step format and validates it; the backend only guarantees what ADR-0002 asks of it:
//! atomic writes, and a corrupt file is set aside for inspection instead of being deleted or overwritten.

use crate::files::{atomic_write, quarantine_corrupt};
use serde_json::{json, Value};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// Version of the file layout; the frontend bumps its own constant in step with this one.
pub const VERSION: u64 = 1;

/// A macro file is a few KB; refusing anything huge keeps a runaway recording from filling the disk.
const MAX_BYTES: usize = 8 * 1024 * 1024;

fn empty() -> Value {
    json!({ "version": VERSION, "macros": [] })
}

/// Missing file -> no macros. Unparsable file -> no macros, with the bad file preserved as `.corrupt`.
pub fn load(path: &Path) -> Value {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice::<Value>(&bytes).unwrap_or_else(|_| {
            let _ = quarantine_corrupt(path);
            empty()
        }),
        Err(e) if e.kind() == ErrorKind::NotFound => empty(),
        Err(_) => empty(),
    }
}

/// Reject anything that is not shaped like a macro file, so a bug in the frontend cannot clobber good data.
fn validate(file: &Value) -> Result<(), String> {
    let obj = file.as_object().ok_or("macro file must be a JSON object")?;
    match obj.get("version").and_then(Value::as_u64) {
        Some(VERSION) => {}
        other => return Err(format!("unsupported macro file version: {other:?}")),
    }
    let macros = obj.get("macros").and_then(Value::as_array).ok_or("macro file needs a `macros` array")?;
    for m in macros {
        let name = m.get("name").and_then(Value::as_str).filter(|n| !n.trim().is_empty());
        if name.is_none() || !m.get("steps").map(Value::is_array).unwrap_or(false) {
            return Err("every macro needs a non-empty name and a `steps` array".to_string());
        }
    }
    Ok(())
}

pub fn save(path: &Path, file: &Value) -> Result<(), String> {
    validate(file)?;
    let bytes = serde_json::to_vec_pretty(file).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("macro file is too large".to_string());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    atomic_write(path, &bytes)
}

pub struct MacroState {
    pub path: PathBuf,
}

#[tauri::command]
pub fn load_macros(state: tauri::State<MacroState>) -> Value {
    load(&state.path)
}

#[tauri::command]
pub fn save_macros(state: tauri::State<MacroState>, file: Value) -> Result<(), String> {
    save(&state.path, &file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Value {
        json!({
            "version": 1,
            "macros": [
                { "name": "cleanup", "steps": [
                    { "type": "text", "insert": "abc", "before": 0, "after": 0 },
                    { "type": "command", "id": "line.moveDown" }
                ]},
                { "name": "second", "shortcut": "Ctrl+1", "steps": [] }
            ]
        })
    }

    #[test]
    fn missing_file_loads_as_no_macros() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(&dir.path().join("macros.json")), empty());
    }

    #[test]
    fn save_then_load_roundtrips_exactly() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        save(&path, &sample()).unwrap();
        assert_eq!(load(&path), sample());
    }

    #[test]
    fn saving_creates_missing_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("macros.json");
        save(&path, &sample()).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn the_file_is_versioned() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        save(&path, &sample()).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"version\": 1"));
    }

    #[test]
    fn corrupt_file_loads_as_empty_and_is_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        fs::write(&path, b"{ not json").unwrap();
        assert_eq!(load(&path), empty());
        assert!(!path.exists());
        assert_eq!(fs::read(dir.path().join("macros.json.corrupt")).unwrap(), b"{ not json");
    }

    #[test]
    fn a_save_after_a_corrupt_load_writes_a_fresh_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        fs::write(&path, b"garbage").unwrap();
        let _ = load(&path);
        save(&path, &sample()).unwrap();
        assert_eq!(load(&path), sample());
        assert!(dir.path().join("macros.json.corrupt").exists());
    }

    #[test]
    fn save_leaves_no_temp_files_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        save(&path, &sample()).unwrap();
        save(&path, &sample()).unwrap();
        let names: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("macros.json")]);
    }

    #[test]
    fn a_failed_validation_keeps_the_previous_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        save(&path, &sample()).unwrap();
        assert!(save(&path, &json!({ "version": 1, "macros": [{ "name": "", "steps": [] }] })).is_err());
        assert_eq!(load(&path), sample());
    }

    #[test]
    fn rejects_files_that_are_not_macro_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macros.json");
        for bad in [
            json!([]),
            json!("text"),
            json!({ "macros": [] }),
            json!({ "version": 2, "macros": [] }),
            json!({ "version": 1 }),
            json!({ "version": 1, "macros": "x" }),
            json!({ "version": 1, "macros": [{ "name": "a" }] }),
            json!({ "version": 1, "macros": [{ "steps": [] }] }),
        ] {
            assert!(save(&path, &bad).is_err(), "should reject {bad}");
        }
        assert!(!path.exists());
    }
}
