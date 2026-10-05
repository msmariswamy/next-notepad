//! User settings persisted as JSON in the app-data directory (spec: settings).

use crate::files::{atomic_write, quarantine_corrupt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// `#[serde(default)]` lets older files that lack newer keys load with defaults.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Off by default: closing a dirty tab or quitting prompts. On: silent, text kept in the session.
    pub silent_close: bool,
    pub theme: Theme,
    pub font_family: String,
    pub font_size: u32,
    pub word_wrap: bool,
    pub show_whitespace: bool,
    pub large_file_threshold_bytes: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            silent_close: false,
            theme: Theme::System,
            font_family: "ui-monospace, \"SF Mono\", Menlo, monospace".to_string(),
            font_size: 13,
            word_wrap: false,
            show_whitespace: false,
            large_file_threshold_bytes: 50 * 1024 * 1024,
        }
    }
}

/// Missing file -> defaults. Invalid file -> defaults, with the bad file preserved as `.corrupt`.
pub fn load(path: &Path) -> Settings {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|_| {
            let _ = quarantine_corrupt(path);
            Settings::default()
        }),
        Err(e) if e.kind() == ErrorKind::NotFound => Settings::default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    atomic_write(path, &json)
}

pub struct SettingsState {
    pub path: PathBuf,
    pub current: Mutex<Settings>,
}

impl SettingsState {
    pub fn load(path: PathBuf) -> Self {
        let current = Mutex::new(load(&path));
        SettingsState { path, current }
    }
}

#[tauri::command]
pub fn get_settings(state: tauri::State<SettingsState>) -> Settings {
    state.current.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_settings(state: tauri::State<SettingsState>, settings: Settings) -> Result<Settings, String> {
    save(&state.path, &settings)?;
    *state.current.lock().unwrap() = settings.clone();
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_spec() {
        let s = Settings::default();
        assert!(!s.silent_close, "silentClose defaults to off");
        assert_eq!(s.theme, Theme::System);
        assert_eq!(s.large_file_threshold_bytes, 50 * 1024 * 1024);
    }

    #[test]
    fn missing_file_yields_defaults() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(&dir.path().join("settings.json")), Settings::default());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let s = Settings { silent_close: true, font_size: 16, theme: Theme::Dark, ..Settings::default() };
        save(&path, &s).unwrap();
        assert_eq!(load(&path), s);
    }

    #[test]
    fn saved_file_uses_camel_case_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        save(&path, &Settings::default()).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"silentClose\""));
        assert!(text.contains("\"fontSize\""));
    }

    #[test]
    fn partial_file_fills_missing_keys_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"silentClose": true}"#).unwrap();
        let s = load(&path);
        assert!(s.silent_close);
        assert_eq!(s.font_size, 13);
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults_and_is_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Settings::default());
        assert!(!path.exists());
        assert_eq!(fs::read_to_string(dir.path().join("settings.json.corrupt")).unwrap(), "{ not json");
    }

    #[test]
    fn save_creates_missing_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/app/settings.json");
        save(&path, &Settings::default()).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn save_leaves_no_temp_files_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        save(&path, &Settings::default()).unwrap();
        save(&path, &Settings { word_wrap: true, ..Settings::default() }).unwrap();
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
