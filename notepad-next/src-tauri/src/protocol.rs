//! The line-based protocol between the `next-notepad` client and the running app (ADR-0009).
//!
//! Each message is one JSON object on one line. The client sends a [`Request`]; the app answers with
//! `{"ok":true}` once the files are open, then `{"done":true}` in wait mode, or `{"error":"..."}` at any point.

use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Read};
use std::path::{Component, Path, PathBuf};

/// Longest line either side will read. A request is a few paths, so 1 MiB is generous.
pub const MAX_LINE: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Request {
    pub token: String,
    pub files: Vec<String>,
    #[serde(default)]
    pub wait: bool,
    /// The client's working directory, for information; `files` are already absolute.
    #[serde(default)]
    pub cwd: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Response {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ok: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Response {
    pub fn ok() -> Self {
        Response { ok: Some(true), ..Default::default() }
    }
    pub fn done() -> Self {
        Response { done: Some(true), ..Default::default() }
    }
    pub fn error(message: impl Into<String>) -> Self {
        Response { error: Some(message.into()), ..Default::default() }
    }
    /// The message as one line, newline included.
    pub fn to_line(&self) -> String {
        let mut s = serde_json::to_string(self).expect("a Response always serialises");
        s.push('\n');
        s
    }
}

/// Read one line without its newline. `Ok(None)` is end of input; a line over `max` bytes is an error.
pub fn read_line<R: BufRead>(reader: &mut R, max: usize) -> io::Result<Option<String>> {
    let mut buf = String::new();
    let n = reader.take(max as u64 + 1).read_line(&mut buf)?;
    if n == 0 {
        return Ok(None);
    }
    // The limit counts the line's content, not its newline: reading max + 1 bytes without reaching a newline means too long.
    let too_long = || io::Error::new(io::ErrorKind::InvalidData, format!("line is longer than {max} bytes"));
    if !buf.ends_with('\n') && buf.len() > max {
        return Err(too_long());
    }
    while buf.ends_with('\n') || buf.ends_with('\r') {
        buf.pop();
    }
    if buf.len() > max {
        return Err(too_long());
    }
    Ok(Some(buf))
}

/// Make `path` absolute against `cwd` and tidy `.` and `..` without touching the filesystem (the file may not exist yet).
pub fn resolve(path: &str, cwd: &Path) -> PathBuf {
    let joined = if Path::new(path).is_absolute() { PathBuf::from(path) } else { cwd.join(path) };
    let mut out = PathBuf::new();
    for c in joined.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                // Never pop past the root or a drive prefix.
                if !matches!(out.components().next_back(), Some(Component::RootDir | Component::Prefix(_)) | None) {
                    out.pop();
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn a_request_round_trips_through_json() {
        let r = Request { token: "t".into(), files: vec!["/a".into(), "/b".into()], wait: true, cwd: "/w".into() };
        let line = serde_json::to_string(&r).unwrap();
        assert!(!line.contains('\n'));
        assert_eq!(serde_json::from_str::<Request>(&line).unwrap(), r);
    }

    #[test]
    fn wait_and_cwd_default_when_missing_and_unknown_fields_are_ignored() {
        let r: Request = serde_json::from_str(r#"{"token":"t","files":["/a"],"future":1}"#).unwrap();
        assert_eq!((r.wait, r.cwd.as_str()), (false, ""));
    }

    #[test]
    fn a_request_without_a_token_or_files_is_rejected() {
        assert!(serde_json::from_str::<Request>(r#"{"files":["/a"]}"#).is_err());
        assert!(serde_json::from_str::<Request>(r#"{"token":"t"}"#).is_err());
    }

    #[test]
    fn responses_serialise_only_their_own_field() {
        assert_eq!(Response::ok().to_line(), "{\"ok\":true}\n");
        assert_eq!(Response::done().to_line(), "{\"done\":true}\n");
        assert_eq!(Response::error("no \"way\"").to_line(), "{\"error\":\"no \\\"way\\\"\"}\n");
    }

    #[test]
    fn responses_parse_back() {
        assert_eq!(serde_json::from_str::<Response>("{\"done\":true}").unwrap(), Response::done());
        assert_eq!(serde_json::from_str::<Response>("{\"error\":\"x\"}").unwrap(), Response::error("x"));
    }

    #[test]
    fn read_line_strips_the_newline_and_reads_one_line_at_a_time() {
        let mut r = Cursor::new(b"one\ntwo\r\nthree".to_vec());
        assert_eq!(read_line(&mut r, 100).unwrap(), Some("one".into()));
        assert_eq!(read_line(&mut r, 100).unwrap(), Some("two".into()));
        assert_eq!(read_line(&mut r, 100).unwrap(), Some("three".into()));
        assert_eq!(read_line(&mut r, 100).unwrap(), None);
    }

    #[test]
    fn read_line_refuses_a_line_over_the_limit() {
        let mut r = Cursor::new(vec![b'x'; 50]);
        let e = read_line(&mut r, 10).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn read_line_accepts_a_line_exactly_at_the_limit() {
        let mut data = vec![b'x'; 10];
        data.push(b'\n');
        assert_eq!(read_line(&mut Cursor::new(data), 10).unwrap().unwrap().len(), 10);
    }

    #[test]
    fn resolve_joins_relative_paths_to_the_working_directory() {
        let cwd = Path::new(if cfg!(windows) { "C:\\work\\app" } else { "/work/app" });
        let got = resolve("./a.yaml", cwd);
        assert_eq!(got, cwd.join("a.yaml"));
        assert_eq!(resolve("sub/../b.txt", cwd), cwd.join("b.txt"));
    }

    #[test]
    fn resolve_keeps_absolute_paths() {
        let abs = if cfg!(windows) { "C:\\tmp\\f.yaml" } else { "/tmp/f.yaml" };
        assert_eq!(resolve(abs, Path::new("/ignored")), PathBuf::from(abs));
    }

    #[test]
    fn resolve_does_not_climb_above_the_root() {
        let cwd = Path::new(if cfg!(windows) { "C:\\" } else { "/" });
        let got = resolve("../../x", cwd);
        assert_eq!(got, cwd.join("x"));
    }
}
