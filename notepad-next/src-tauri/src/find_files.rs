//! Find in Files / Find in Projects backend (spec: find-in-files; ADR-0002, ADR-0003).
//!
//! Rust walks the directory, skips binary/unreadable files, and either matches with the Rust
//! regex engine or, when the pattern needs the JS engine, streams file contents so the frontend
//! can match them with identical semantics to in-editor search.

use crate::files::{decode, save_file};
use crate::regex_compat::{compile, expand_replacement, Compiled, SearchOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

const MAX_HITS: usize = 10_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindRequest {
    pub pattern: String,
    pub options: SearchOptions,
    pub root: String,
    /// Wildcards separated by `;` (`*.txt;*.md`); `!*.log` excludes; empty or `*.*` means everything.
    pub filters: String,
    pub recursive: bool,
    pub include_hidden: bool,
    pub max_file_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FindEvent {
    /// A match found by the Rust engine. Columns are UTF-16 code units within `text` (the first line of the match).
    #[serde(rename_all = "camelCase")]
    Hit { path: String, line: usize, text: String, start: usize, end: usize },
    /// File contents (normalised to `\n`) for the frontend's JS engine when the pattern needs it.
    #[serde(rename_all = "camelCase")]
    File { path: String, text: String },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindSummary {
    pub files_searched: usize,
    pub files_matched: usize,
    pub hits: usize,
    pub skipped_binary: usize,
    pub skipped_unreadable: usize,
    pub skipped_too_large: usize,
    pub cancelled: bool,
    pub needs_js: bool,
    /// True when the hit list was capped at MAX_HITS.
    pub truncated: bool,
}

// ---------------------------------------------------------------- filters

#[derive(Debug, Clone, PartialEq)]
pub struct Filter {
    pub pattern: String,
    pub negate: bool,
}

pub fn parse_filters(spec: &str) -> Vec<Filter> {
    spec.split([';', ',', ' '])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| match s.strip_prefix('!') {
            Some(rest) => Filter { pattern: rest.to_lowercase(), negate: true },
            None => Filter { pattern: s.to_lowercase(), negate: false },
        })
        .collect()
}

/// `*` and `?` wildcard match, case-insensitive (pattern already lower-cased).
fn wildcard(pattern: &[char], name: &[char]) -> bool {
    match (pattern.first(), name.first()) {
        (None, None) => true,
        (Some('*'), _) => wildcard(&pattern[1..], name) || (!name.is_empty() && wildcard(pattern, &name[1..])),
        (Some('?'), Some(_)) => wildcard(&pattern[1..], &name[1..]),
        (Some(p), Some(n)) if p == n => wildcard(&pattern[1..], &name[1..]),
        _ => false,
    }
}

pub fn matches_filters(file_name: &str, filters: &[Filter]) -> bool {
    let name: Vec<char> = file_name.to_lowercase().chars().collect();
    let hit = |f: &Filter| {
        let p: Vec<char> = f.pattern.chars().collect();
        wildcard(&p, &name)
    };
    if filters.iter().any(|f| f.negate && hit(f)) {
        return false;
    }
    let includes: Vec<&Filter> = filters.iter().filter(|f| !f.negate).collect();
    includes.is_empty() || includes.iter().any(|f| f.pattern == "*.*" || f.pattern == "*" || hit(f))
}

// ---------------------------------------------------------------- walking

pub struct WalkOptions {
    pub recursive: bool,
    pub include_hidden: bool,
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Visit matching files in sorted order. Directory symlinks are not followed, which avoids loops.
pub fn walk(root: &Path, opts: &WalkOptions, filters: &[Filter], cancel: &AtomicBool, visit: &mut dyn FnMut(PathBuf)) {
    let Ok(read) = fs::read_dir(root) else { return };
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !opts.include_hidden && is_hidden(&name) {
            continue;
        }
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if opts.recursive {
                walk(&entry.path(), opts, filters, cancel, visit);
            }
        } else if kind.is_file() && matches_filters(&name, filters) {
            visit(entry.path());
        }
    }
}

/// A NUL byte near the start means binary, unless the file has a UTF-16 BOM.
pub fn looks_binary(head: &[u8]) -> bool {
    if head.starts_with(&[0xFF, 0xFE]) || head.starts_with(&[0xFE, 0xFF]) {
        return false;
    }
    head.contains(&0)
}

enum Loaded {
    Text(String),
    Binary,
    TooLarge,
    Unreadable,
}

fn load(path: &Path, max_bytes: u64) -> Loaded {
    let Ok(meta) = fs::metadata(path) else { return Loaded::Unreadable };
    if meta.len() > max_bytes {
        return Loaded::TooLarge;
    }
    let Ok(mut file) = fs::File::open(path) else { return Loaded::Unreadable };
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    if file.read_to_end(&mut bytes).is_err() {
        return Loaded::Unreadable;
    }
    if looks_binary(&bytes[..bytes.len().min(8192)]) {
        return Loaded::Binary;
    }
    Loaded::Text(decode(&bytes).text)
}

// ---------------------------------------------------------------- search

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

pub fn search_dir(
    req: &FindRequest,
    cancel: &AtomicBool,
    emit: &mut dyn FnMut(FindEvent),
) -> Result<FindSummary, String> {
    let compiled = compile(&req.pattern, &req.options)?;
    let mut summary = FindSummary { needs_js: matches!(compiled, Compiled::NeedsJs), ..Default::default() };
    let filters = parse_filters(&req.filters);
    let walk_opts = WalkOptions { recursive: req.recursive, include_hidden: req.include_hidden };

    walk(Path::new(&req.root), &walk_opts, &filters, cancel, &mut |path| {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let text = match load(&path, req.max_file_bytes) {
            Loaded::Text(t) => t,
            Loaded::Binary => return summary.skipped_binary += 1,
            Loaded::TooLarge => return summary.skipped_too_large += 1,
            Loaded::Unreadable => return summary.skipped_unreadable += 1,
        };
        summary.files_searched += 1;
        let path_str = path.to_string_lossy().into_owned();
        match &compiled {
            Compiled::NeedsJs => emit(FindEvent::File { path: path_str, text }),
            Compiled::Rust(re) => {
                let mut matched = false;
                for m in re.find_iter(&text) {
                    if summary.hits >= MAX_HITS {
                        summary.truncated = true;
                        break;
                    }
                    matched = true;
                    summary.hits += 1;
                    let line_start = text[..m.start()].rfind('\n').map_or(0, |i| i + 1);
                    let line_end = text[line_start..].find('\n').map_or(text.len(), |i| line_start + i);
                    let line_no = text[..line_start].matches('\n').count() + 1;
                    let start = utf16_len(&text[line_start..m.start()]);
                    let end = start + utf16_len(&text[m.start()..m.end().min(line_end)]);
                    emit(FindEvent::Hit {
                        path: path_str.clone(),
                        line: line_no,
                        text: text[line_start..line_end].to_string(),
                        start,
                        end,
                    });
                }
                if matched {
                    summary.files_matched += 1;
                }
            }
        }
    });
    summary.cancelled = cancel.load(Ordering::Relaxed);
    Ok(summary)
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceSummary {
    pub files_changed: usize,
    pub replacements: usize,
    pub skipped_unreadable: usize,
}

/// Replace in every matching file. Only for Rust-eligible patterns; the frontend handles the rest.
pub fn replace_in_dir(req: &FindRequest, replacement: &str, cancel: &AtomicBool) -> Result<ReplaceSummary, String> {
    let Compiled::Rust(re) = compile(&req.pattern, &req.options)? else {
        return Err("this pattern needs the JavaScript engine; replace through the frontend".to_string());
    };
    let filters = parse_filters(&req.filters);
    let walk_opts = WalkOptions { recursive: req.recursive, include_hidden: req.include_hidden };
    let mut summary = ReplaceSummary::default();
    let mut paths = Vec::new();
    walk(Path::new(&req.root), &walk_opts, &filters, cancel, &mut |p| paths.push(p));

    for path in paths {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let Ok(meta) = fs::metadata(&path) else { continue };
        if meta.len() > req.max_file_bytes {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            summary.skipped_unreadable += 1;
            continue;
        };
        if looks_binary(&bytes[..bytes.len().min(8192)]) {
            continue;
        }
        let loaded = decode(&bytes);
        let mut out = String::with_capacity(loaded.text.len());
        let mut last = 0;
        let mut count = 0;
        for caps in re.captures_iter(&loaded.text) {
            let whole = caps.get(0).unwrap();
            out.push_str(&loaded.text[last..whole.start()]);
            let groups: Vec<Option<&str>> = (0..caps.len()).map(|i| caps.get(i).map(|m| m.as_str())).collect();
            out.push_str(&expand_replacement(replacement, &groups, req.options.mode));
            last = whole.end();
            count += 1;
        }
        if count == 0 {
            continue;
        }
        out.push_str(&loaded.text[last..]);
        // Writes through the same encode path as the editor, so encoding, BOM and line endings survive.
        save_file(&path, &out, &loaded.encoding, loaded.bom, loaded.eol)?;
        summary.files_changed += 1;
        summary.replacements += count;
    }
    Ok(summary)
}

// ---------------------------------------------------------------- Tauri commands

#[derive(Default)]
pub struct FindJobs(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

fn register(jobs: &FindJobs, id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    jobs.0.lock().unwrap().insert(id.to_string(), flag.clone());
    flag
}

#[tauri::command(async)]
pub fn find_in_files(
    jobs: tauri::State<FindJobs>,
    job_id: String,
    request: FindRequest,
    on_event: Channel<FindEvent>,
) -> Result<FindSummary, String> {
    let cancel = register(&jobs, &job_id);
    let result = search_dir(&request, &cancel, &mut |event| {
        let _ = on_event.send(event);
    });
    jobs.0.lock().unwrap().remove(&job_id);
    result
}

#[tauri::command(async)]
pub fn replace_in_files(
    jobs: tauri::State<FindJobs>,
    job_id: String,
    request: FindRequest,
    replacement: String,
) -> Result<ReplaceSummary, String> {
    let cancel = register(&jobs, &job_id);
    let result = replace_in_dir(&request, &replacement, &cancel);
    jobs.0.lock().unwrap().remove(&job_id);
    result
}

#[tauri::command]
pub fn cancel_find(jobs: tauri::State<FindJobs>, job_id: String) {
    if let Some(flag) = jobs.0.lock().unwrap().get(&job_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::regex_compat::Mode;
    use std::fs;

    fn req(root: &Path, pattern: &str) -> FindRequest {
        FindRequest {
            pattern: pattern.to_string(),
            options: SearchOptions { mode: Mode::Normal, match_case: false, whole_word: false, dot_matches_newline: false },
            root: root.to_string_lossy().into_owned(),
            filters: "*.*".to_string(),
            recursive: true,
            include_hidden: false,
            max_file_bytes: 50 * 1024 * 1024,
        }
    }

    fn run(r: &FindRequest) -> (FindSummary, Vec<FindEvent>) {
        let mut events = Vec::new();
        let s = search_dir(r, &AtomicBool::new(false), &mut |e| events.push(e)).unwrap();
        (s, events)
    }

    fn write(dir: &Path, rel: &str, content: &[u8]) {
        let p = dir.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    fn hit_paths(events: &[FindEvent]) -> Vec<String> {
        events
            .iter()
            .filter_map(|e| match e {
                FindEvent::Hit { path, .. } => Some(Path::new(path).file_name().unwrap().to_string_lossy().into_owned()),
                _ => None,
            })
            .collect()
    }

    // ---- filters
    #[test]
    fn filters_match_extensions_case_insensitively() {
        let f = parse_filters("*.TXT;*.md");
        assert!(matches_filters("a.txt", &f));
        assert!(matches_filters("README.MD", &f));
        assert!(!matches_filters("a.rs", &f));
    }

    #[test]
    fn star_dot_star_and_empty_match_everything() {
        assert!(matches_filters("anything.xyz", &parse_filters("*.*")));
        assert!(matches_filters("noext", &parse_filters("*.*")));
        assert!(matches_filters("x", &parse_filters("")));
    }

    #[test]
    fn question_mark_matches_one_character() {
        let f = parse_filters("file?.txt");
        assert!(matches_filters("file1.txt", &f));
        assert!(!matches_filters("file12.txt", &f));
    }

    #[test]
    fn negated_filters_exclude() {
        let f = parse_filters("*.* !*.log");
        assert!(matches_filters("a.txt", &f));
        assert!(!matches_filters("a.log", &f));
    }

    // ---- walking
    #[test]
    fn recursive_toggle_controls_sub_folders() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "top.txt", b"needle");
        write(d.path(), "sub/deep.txt", b"needle");
        let mut r = req(d.path(), "needle");
        r.recursive = false;
        assert_eq!(hit_paths(&run(&r).1), vec!["top.txt"]);
        r.recursive = true;
        assert_eq!(hit_paths(&run(&r).1), vec!["deep.txt", "top.txt"]);
    }

    #[test]
    fn hidden_folders_and_files_are_skipped_unless_enabled() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), ".git/config", b"needle");
        write(d.path(), ".hidden.txt", b"needle");
        write(d.path(), "visible.txt", b"needle");
        let mut r = req(d.path(), "needle");
        assert_eq!(hit_paths(&run(&r).1), vec!["visible.txt"]);
        r.include_hidden = true;
        assert_eq!(run(&r).0.files_matched, 3);
    }

    #[test]
    fn name_filter_limits_files() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"needle");
        write(d.path(), "b.md", b"needle");
        let mut r = req(d.path(), "needle");
        r.filters = "*.txt".into();
        assert_eq!(hit_paths(&run(&r).1), vec!["a.txt"]);
    }

    #[test]
    fn results_come_in_a_stable_sorted_order() {
        let d = tempfile::tempdir().unwrap();
        for n in ["c.txt", "a.txt", "b.txt"] {
            write(d.path(), n, b"needle");
        }
        assert_eq!(hit_paths(&run(&req(d.path(), "needle")).1), vec!["a.txt", "b.txt", "c.txt"]);
    }

    #[cfg(unix)]
    #[test]
    fn directory_symlink_loops_are_not_followed() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "sub/a.txt", b"needle");
        std::os::unix::fs::symlink(d.path(), d.path().join("sub/loop")).unwrap();
        assert_eq!(run(&req(d.path(), "needle")).0.hits, 1);
    }

    // ---- skipping
    #[test]
    fn binary_files_are_skipped_and_counted() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "img.png", &[0x89, b'P', b'N', b'G', 0, 0, 0, b'n', b'e', b'e', b'd', b'l', b'e']);
        write(d.path(), "t.txt", b"needle");
        let (s, ev) = run(&req(d.path(), "needle"));
        assert_eq!(s.skipped_binary, 1);
        assert_eq!(s.files_searched, 1);
        assert_eq!(hit_paths(&ev), vec!["t.txt"]);
    }

    #[test]
    fn utf16_text_files_with_a_bom_are_searched() {
        let d = tempfile::tempdir().unwrap();
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend("needle here".encode_utf16().flat_map(|u| u.to_le_bytes()));
        write(d.path(), "u16.txt", &bytes);
        let (s, _) = run(&req(d.path(), "needle"));
        assert_eq!((s.skipped_binary, s.hits), (0, 1));
    }

    #[test]
    fn oversized_files_are_skipped_and_counted() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "big.txt", b"needle needle needle");
        let mut r = req(d.path(), "needle");
        r.max_file_bytes = 5;
        let (s, _) = run(&r);
        assert_eq!((s.skipped_too_large, s.hits), (1, 0));
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_files_are_skipped_and_counted() {
        use std::os::unix::fs::PermissionsExt;
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "secret.txt", b"needle");
        fs::set_permissions(d.path().join("secret.txt"), fs::Permissions::from_mode(0o000)).unwrap();
        // Running as root can read anything; only assert when the file really is unreadable.
        if fs::read(d.path().join("secret.txt")).is_err() {
            assert_eq!(run(&req(d.path(), "needle")).0.skipped_unreadable, 1);
        }
        fs::set_permissions(d.path().join("secret.txt"), fs::Permissions::from_mode(0o644)).unwrap();
    }

    // ---- hits
    #[test]
    fn hits_carry_path_line_text_and_columns() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"one\ntwo needle x\nthree");
        let (s, ev) = run(&req(d.path(), "needle"));
        assert_eq!((s.files_matched, s.hits), (1, 1));
        let FindEvent::Hit { line, text, start, end, .. } = &ev[0] else { panic!() };
        assert_eq!((*line, text.as_str(), *start, *end), (2, "two needle x", 4, 10));
    }

    #[test]
    fn crlf_files_report_correct_line_numbers_and_clean_text() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"one\r\ntwo\r\nneedle\r\n");
        let FindEvent::Hit { line, text, .. } = &run(&req(d.path(), "needle")).1[0] else { panic!() };
        assert_eq!((*line, text.as_str()), (3, "needle"));
    }

    #[test]
    fn columns_count_utf16_code_units() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", "😀 needle".as_bytes());
        let FindEvent::Hit { start, end, .. } = &run(&req(d.path(), "needle")).1[0] else { panic!() };
        assert_eq!((*start, *end), (3, 9)); // the emoji is two UTF-16 units, plus a space
    }

    #[test]
    fn several_hits_in_one_file_count_once_for_files_matched() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"needle needle\nneedle");
        let (s, _) = run(&req(d.path(), "needle"));
        assert_eq!((s.files_matched, s.hits), (1, 3));
    }

    #[test]
    fn regex_mode_works_across_files() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"id=12 id=345");
        let mut r = req(d.path(), "id=\\d+");
        r.options.mode = Mode::Regex;
        assert_eq!(run(&r).0.hits, 2);
    }

    // ---- fixture directory (task 9.7): plain pattern and lookahead pattern
    #[test]
    fn fixture_directory_plain_pattern_runs_in_rust() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"foobar");
        write(d.path(), "sub/b.txt", b"foobaz foobar");
        let mut r = req(d.path(), "foobar");
        r.options.mode = Mode::Regex;
        let (s, ev) = run(&r);
        assert!(!s.needs_js);
        assert_eq!(s.hits, 2);
        assert!(ev.iter().all(|e| matches!(e, FindEvent::Hit { .. })));
    }

    #[test]
    fn fixture_directory_lookahead_streams_file_contents_for_the_js_engine() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"foobar foobaz");
        let mut r = req(d.path(), "foo(?=bar)");
        r.options.mode = Mode::Regex;
        let (s, ev) = run(&r);
        assert!(s.needs_js);
        assert_eq!(s.hits, 0, "Rust must not match lookahead patterns itself");
        let FindEvent::File { text, .. } = &ev[0] else { panic!("expected file contents") };
        assert_eq!(text, "foobar foobaz");
    }

    #[test]
    fn invalid_regex_is_reported_not_panicked() {
        let d = tempfile::tempdir().unwrap();
        let mut r = req(d.path(), "(unclosed");
        r.options.mode = Mode::Regex;
        assert!(search_dir(&r, &AtomicBool::new(false), &mut |_| {}).is_err());
    }

    // ---- cancellation and caps
    #[test]
    fn a_cancelled_search_stops_and_says_so() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"needle");
        let cancel = AtomicBool::new(true);
        let s = search_dir(&req(d.path(), "needle"), &cancel, &mut |_| {}).unwrap();
        assert!(s.cancelled);
        assert_eq!(s.hits, 0);
    }

    #[test]
    fn cancelling_midway_keeps_partial_results() {
        let d = tempfile::tempdir().unwrap();
        for n in ["a.txt", "b.txt", "c.txt"] {
            write(d.path(), n, b"needle");
        }
        let cancel = AtomicBool::new(false);
        let mut seen = 0;
        let s = search_dir(&req(d.path(), "needle"), &cancel, &mut |_| {
            seen += 1;
            if seen == 1 {
                cancel.store(true, Ordering::Relaxed);
            }
        })
        .unwrap();
        assert!(s.cancelled);
        assert_eq!(s.hits, 1);
    }

    // ---- replace in files
    #[test]
    fn replace_rewrites_matching_files_and_preserves_crlf() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"foo\r\nbar\r\n");
        write(d.path(), "b.txt", b"nothing here");
        let s = replace_in_dir(&req(d.path(), "foo"), "baz", &AtomicBool::new(false)).unwrap();
        assert_eq!((s.files_changed, s.replacements), (1, 1));
        assert_eq!(fs::read(d.path().join("a.txt")).unwrap(), b"baz\r\nbar\r\n");
        assert_eq!(fs::read(d.path().join("b.txt")).unwrap(), b"nothing here");
    }

    #[test]
    fn replace_expands_capture_groups_in_regex_mode() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"hello world");
        let mut r = req(d.path(), "(\\w+) (\\w+)");
        r.options.mode = Mode::Regex;
        replace_in_dir(&r, "\\2 \\1", &AtomicBool::new(false)).unwrap();
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "world hello");
    }

    #[test]
    fn replace_preserves_utf8_bom() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", &[0xEF, 0xBB, 0xBF, b'f', b'o', b'o']);
        replace_in_dir(&req(d.path(), "foo"), "bar", &AtomicBool::new(false)).unwrap();
        assert_eq!(fs::read(d.path().join("a.txt")).unwrap(), [0xEF, 0xBB, 0xBF, b'b', b'a', b'r']);
    }

    #[test]
    fn replace_skips_binary_files() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "b.bin", &[0, b'f', b'o', b'o']);
        let s = replace_in_dir(&req(d.path(), "foo"), "bar", &AtomicBool::new(false)).unwrap();
        assert_eq!(s.files_changed, 0);
        assert_eq!(fs::read(d.path().join("b.bin")).unwrap(), [0, b'f', b'o', b'o']);
    }

    #[test]
    fn replace_refuses_patterns_that_need_the_js_engine() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.txt", b"foobar");
        let mut r = req(d.path(), "foo(?=bar)");
        r.options.mode = Mode::Regex;
        assert!(replace_in_dir(&r, "x", &AtomicBool::new(false)).is_err());
        assert_eq!(fs::read(d.path().join("a.txt")).unwrap(), b"foobar");
    }
}
