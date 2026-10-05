//! Session store: open tabs and their unsaved text survive quit and crashes
//! (spec: session-restore; design D3/D4; ADR-0002).
//!
//! Layout inside the app-data directory:
//!   session/session.json        tab list, active tab, recently closed (no text)
//!   session/tabs/<key>.txt      text of untitled/dirty tabs and recently-closed tabs
//! Content files are written first and session.json last (atomically), so a crash
//! always leaves a loadable session.

use crate::files::{atomic_write, quarantine_corrupt, Eol};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// A tab as exchanged with the frontend. `text` is `None` for clean saved tabs,
/// which are reloaded from their path instead of being copied into the session.
/// Caret and scroll position of a tab (spec: session-restore). Optional in the file so older sessions still load.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewState {
    pub anchor: u64,
    pub head: u64,
    pub scroll_top: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSnapshot {
    pub id: String,
    pub title: String,
    pub path: Option<String>,
    pub encoding: String,
    pub bom: bool,
    pub eol: Eol,
    pub language: String,
    /// True once the user picked the language from the menu; auto-detection must not override it.
    #[serde(default)]
    pub language_manual: bool,
    pub dirty: bool,
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_state: Option<ViewState>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub tabs: Vec<TabSnapshot>,
    pub active_id: Option<String>,
    #[serde(default)]
    pub recently_closed: Vec<TabSnapshot>,
}

/// What is written to session.json: the snapshot minus text, plus which tabs have a content file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredTab {
    #[serde(flatten)]
    meta: TabMeta,
    content_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TabMeta {
    id: String,
    title: String,
    path: Option<String>,
    encoding: String,
    bom: bool,
    eol: Eol,
    language: String,
    #[serde(default)]
    language_manual: bool,
    dirty: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    view_state: Option<ViewState>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    version: u32,
    tabs: Vec<StoredTab>,
    active_id: Option<String>,
    #[serde(default)]
    recently_closed: Vec<StoredTab>,
}

const VERSION: u32 = 1;

fn session_file(dir: &Path) -> PathBuf {
    dir.join("session.json")
}

fn tabs_dir(dir: &Path) -> PathBuf {
    dir.join("tabs")
}

/// Ids become file names, so allow only a conservative character set (no path traversal).
fn validate_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(())
    } else {
        Err(format!("invalid tab id: {id:?}"))
    }
}

fn split(tab: &TabSnapshot, key: String) -> (StoredTab, Option<(String, &str)>) {
    let meta = TabMeta {
        id: tab.id.clone(),
        title: tab.title.clone(),
        path: tab.path.clone(),
        encoding: tab.encoding.clone(),
        bom: tab.bom,
        eol: tab.eol,
        language: tab.language.clone(),
        language_manual: tab.language_manual,
        dirty: tab.dirty,
        view_state: tab.view_state,
    };
    match &tab.text {
        Some(text) => (StoredTab { meta, content_key: Some(key.clone()) }, Some((key, text.as_str()))),
        None => (StoredTab { meta, content_key: None }, None),
    }
}

pub fn save(dir: &Path, snapshot: &SessionSnapshot) -> Result<(), String> {
    for tab in snapshot.tabs.iter().chain(&snapshot.recently_closed) {
        validate_id(&tab.id)?;
    }
    let tabs_path = tabs_dir(dir);
    fs::create_dir_all(&tabs_path).map_err(|e| e.to_string())?;

    let mut contents: Vec<(String, &str)> = Vec::new();
    let mut tabs = Vec::new();
    for tab in &snapshot.tabs {
        let (stored, content) = split(tab, tab.id.clone());
        tabs.push(stored);
        contents.extend(content);
    }
    let mut recently_closed = Vec::new();
    for (i, tab) in snapshot.recently_closed.iter().enumerate() {
        let (stored, content) = split(tab, format!("closed-{i}-{}", tab.id));
        recently_closed.push(stored);
        contents.extend(content);
    }

    // 1. Content files first; skip rewriting a file whose bytes are already current.
    for (key, text) in &contents {
        let path = tabs_path.join(format!("{key}.txt"));
        if fs::read(&path).map(|old| old == text.as_bytes()).unwrap_or(false) {
            continue;
        }
        atomic_write(&path, text.as_bytes())?;
    }

    // 2. session.json last, atomically.
    let stored = StoredSession { version: VERSION, tabs, active_id: snapshot.active_id.clone(), recently_closed };
    let json = serde_json::to_vec_pretty(&stored).map_err(|e| e.to_string())?;
    atomic_write(&session_file(dir), &json)?;

    // 3. Only now remove content files nothing references any more.
    let keep: HashSet<String> = contents.iter().map(|(k, _)| format!("{k}.txt")).collect();
    if let Ok(entries) = fs::read_dir(&tabs_path) {
        for entry in entries.flatten() {
            if !keep.contains(entry.file_name().to_string_lossy().as_ref()) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

fn hydrate(dir: &Path, stored: StoredTab) -> Option<TabSnapshot> {
    let text = match &stored.content_key {
        Some(key) => match fs::read_to_string(tabs_dir(dir).join(format!("{key}.txt"))) {
            Ok(text) => Some(text),
            // Content file lost: a tab bound to a path can still reload from disk; an untitled one has nothing left.
            Err(_) if stored.meta.path.is_some() => None,
            Err(_) => return None,
        },
        None => None,
    };
    let m = stored.meta;
    Some(TabSnapshot {
        id: m.id,
        title: m.title,
        path: m.path,
        encoding: m.encoding,
        bom: m.bom,
        eol: m.eol,
        language: m.language,
        language_manual: m.language_manual,
        dirty: m.dirty,
        text,
        view_state: m.view_state,
    })
}

/// Missing store -> empty session. Unreadable store -> empty session, bad file kept as `.corrupt`.
pub fn load(dir: &Path) -> SessionSnapshot {
    let path = session_file(dir);
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == ErrorKind::NotFound => return SessionSnapshot::default(),
        Err(_) => return SessionSnapshot::default(),
    };
    let stored: StoredSession = match serde_json::from_slice(&bytes) {
        Ok(s) => s,
        Err(_) => {
            let _ = quarantine_corrupt(&path);
            return SessionSnapshot::default();
        }
    };
    let tabs: Vec<TabSnapshot> = stored.tabs.into_iter().filter_map(|t| hydrate(dir, t)).collect();
    let active_id = stored.active_id.filter(|id| tabs.iter().any(|t| &t.id == id));
    let recently_closed = stored.recently_closed.into_iter().filter_map(|t| hydrate(dir, t)).collect();
    SessionSnapshot { tabs, active_id, recently_closed }
}

pub struct SessionState {
    pub dir: PathBuf,
}

#[tauri::command]
pub fn save_session(state: tauri::State<SessionState>, snapshot: SessionSnapshot) -> Result<(), String> {
    save(&state.dir, &snapshot)
}

#[tauri::command]
pub fn load_session(state: tauri::State<SessionState>) -> SessionSnapshot {
    load(&state.dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tab(id: &str, text: Option<&str>) -> TabSnapshot {
        TabSnapshot {
            id: id.to_string(),
            title: format!("title-{id}"),
            path: None,
            encoding: "UTF-8".to_string(),
            bom: false,
            eol: Eol::Lf,
            language: "Normal text".to_string(),
            language_manual: false,
            dirty: text.is_some(),
            text: text.map(str::to_string),
            view_state: None,
        }
    }

    fn snap(tabs: Vec<TabSnapshot>) -> SessionSnapshot {
        SessionSnapshot { tabs, active_id: None, recently_closed: vec![] }
    }

    #[test]
    fn missing_store_loads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), SessionSnapshot::default());
    }

    #[test]
    fn untitled_tabs_roundtrip_with_their_text() {
        let dir = tempfile::tempdir().unwrap();
        let s = snap(vec![tab("doc-1", Some("alpha\nbeta")), tab("doc-2", Some("gamma"))]);
        save(dir.path(), &s).unwrap();
        assert_eq!(load(dir.path()), s);
    }

    #[test]
    fn clean_saved_tab_is_stored_by_path_only() {
        let dir = tempfile::tempdir().unwrap();
        let mut t = tab("doc-1", None);
        t.path = Some("/tmp/a.txt".to_string());
        save(dir.path(), &snap(vec![t.clone()])).unwrap();
        assert_eq!(fs::read_dir(dir.path().join("tabs")).unwrap().count(), 0);
        assert_eq!(load(dir.path()).tabs, vec![t]);
    }

    #[test]
    fn dirty_saved_tab_keeps_edited_text_and_path() {
        let dir = tempfile::tempdir().unwrap();
        let mut t = tab("doc-1", Some("edited"));
        t.path = Some("/tmp/a.txt".to_string());
        save(dir.path(), &snap(vec![t.clone()])).unwrap();
        assert_eq!(load(dir.path()).tabs[0], t);
    }

    #[test]
    fn preserves_metadata_and_active_tab_and_order() {
        let dir = tempfile::tempdir().unwrap();
        let mut a = tab("doc-1", Some("a"));
        a.encoding = "UTF-16LE".to_string();
        a.bom = true;
        a.eol = Eol::Crlf;
        a.language = "JSON".to_string();
        let b = tab("doc-2", Some("b"));
        let s = SessionSnapshot { tabs: vec![a, b], active_id: Some("doc-2".into()), recently_closed: vec![] };
        save(dir.path(), &s).unwrap();
        assert_eq!(load(dir.path()), s);
    }

    #[test]
    fn the_manual_language_flag_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let mut t = tab("doc-1", Some("x"));
        t.language = "Python".to_string();
        t.language_manual = true;
        save(dir.path(), &snap(vec![t.clone()])).unwrap();
        assert_eq!(load(dir.path()).tabs[0], t);
    }

    #[test]
    fn sessions_written_before_the_flag_existed_still_load() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("session.json"),
            r#"{"version":1,"tabs":[{"id":"doc-1","title":"new 1","path":null,"encoding":"UTF-8","bom":false,"eol":"lf","language":"JSON","dirty":false,"contentKey":null}],"activeId":null}"#,
        )
        .unwrap();
        // Parsing must neither fail nor quarantine the file; the missing flag defaults to false.
        let loaded = load(dir.path());
        assert!(dir.path().join("session.json").exists());
        assert_eq!(loaded.tabs.len(), 1);
        assert_eq!((loaded.tabs[0].language.as_str(), loaded.tabs[0].language_manual), ("JSON", false));
    }

    #[test]
    fn the_view_state_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let mut t = tab("doc-1", Some("x"));
        t.view_state = Some(ViewState { anchor: 3, head: 7, scroll_top: 120.5 });
        save(dir.path(), &snap(vec![t.clone()])).unwrap();
        assert_eq!(load(dir.path()).tabs[0], t);
    }

    #[test]
    fn sessions_written_before_view_state_existed_load_without_it() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("session.json"),
            r#"{"version":1,"tabs":[{"id":"doc-1","title":"new 1","path":null,"encoding":"UTF-8","bom":false,"eol":"lf","language":"JSON","dirty":false,"contentKey":null}],"activeId":null}"#,
        )
        .unwrap();
        let loaded = load(dir.path());
        assert!(dir.path().join("session.json").exists(), "an older session is not quarantined");
        assert_eq!(loaded.tabs[0].view_state, None);
    }

    #[test]
    fn a_tab_without_view_state_writes_no_view_state_key() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &snap(vec![tab("doc-1", Some("x"))])).unwrap();
        assert!(!fs::read_to_string(dir.path().join("session.json")).unwrap().contains("viewState"));
    }

    #[test]
    fn unknown_active_id_is_dropped_on_load() {
        let dir = tempfile::tempdir().unwrap();
        let s = SessionSnapshot { tabs: vec![tab("doc-1", Some("a"))], active_id: Some("ghost".into()), recently_closed: vec![] };
        save(dir.path(), &s).unwrap();
        assert_eq!(load(dir.path()).active_id, None);
    }

    #[test]
    fn recently_closed_roundtrips_with_text() {
        let dir = tempfile::tempdir().unwrap();
        let s = SessionSnapshot { tabs: vec![], active_id: None, recently_closed: vec![tab("doc-9", Some("gone but kept"))] };
        save(dir.path(), &s).unwrap();
        assert_eq!(load(dir.path()).recently_closed[0].text.as_deref(), Some("gone but kept"));
    }

    #[test]
    fn content_files_for_closed_tabs_are_removed_on_next_save() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &snap(vec![tab("doc-1", Some("a")), tab("doc-2", Some("b"))])).unwrap();
        save(dir.path(), &snap(vec![tab("doc-1", Some("a"))])).unwrap();
        let files: Vec<_> = fs::read_dir(dir.path().join("tabs")).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].to_string_lossy(), "doc-1.txt");
    }

    #[test]
    fn a_changed_tab_text_is_updated() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &snap(vec![tab("doc-1", Some("v1"))])).unwrap();
        save(dir.path(), &snap(vec![tab("doc-1", Some("v2"))])).unwrap();
        assert_eq!(load(dir.path()).tabs[0].text.as_deref(), Some("v2"));
    }

    #[test]
    fn corrupt_session_file_is_quarantined_and_load_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("session.json"), "{ nope").unwrap();
        assert_eq!(load(dir.path()), SessionSnapshot::default());
        assert!(!dir.path().join("session.json").exists());
        assert_eq!(fs::read_to_string(dir.path().join("session.json.corrupt")).unwrap(), "{ nope");
    }

    #[test]
    fn interrupted_write_leaves_the_previous_session_loadable() {
        let dir = tempfile::tempdir().unwrap();
        let s = snap(vec![tab("doc-1", Some("safe"))]);
        save(dir.path(), &s).unwrap();
        // A crash mid-write leaves a stray temp file next to session.json; it must not matter.
        fs::write(dir.path().join(".tmpABCDEF"), "half written").unwrap();
        assert_eq!(load(dir.path()), s);
    }

    #[test]
    fn missing_content_file_drops_an_untitled_tab_but_keeps_a_path_tab() {
        let dir = tempfile::tempdir().unwrap();
        let mut bound = tab("doc-2", Some("x"));
        bound.path = Some("/tmp/b.txt".to_string());
        save(dir.path(), &snap(vec![tab("doc-1", Some("lost")), bound])).unwrap();
        fs::remove_file(dir.path().join("tabs/doc-1.txt")).unwrap();
        fs::remove_file(dir.path().join("tabs/doc-2.txt")).unwrap();
        let loaded = load(dir.path());
        assert_eq!(loaded.tabs.len(), 1);
        assert_eq!(loaded.tabs[0].id, "doc-2");
        assert_eq!(loaded.tabs[0].text, None);
    }

    #[test]
    fn rejects_ids_that_could_escape_the_tabs_directory() {
        let dir = tempfile::tempdir().unwrap();
        let s = snap(vec![tab("../evil", Some("x"))]);
        assert!(save(dir.path(), &s).is_err());
        assert!(!dir.path().join("evil.txt").exists());
    }

    #[test]
    fn empty_session_clears_previous_content() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &snap(vec![tab("doc-1", Some("a"))])).unwrap();
        save(dir.path(), &SessionSnapshot::default()).unwrap();
        assert_eq!(load(dir.path()), SessionSnapshot::default());
        assert_eq!(fs::read_dir(dir.path().join("tabs")).unwrap().count(), 0);
    }
}
