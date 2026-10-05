//! Notepad++-style search patterns for the Rust engine (ADR-0003).
//! The JS twin lives in src/search/regexCompat.ts; both run shared/regex-cases.json.
//!
//! Patterns the Rust `regex` crate cannot express (lookaround, backreferences) or whose
//! whole-word semantics differ are reported as `Compiled::NeedsJs`; the caller then reads
//! file contents in Rust and matches them with the JS engine.

use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Normal,
    Extended,
    Regex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub mode: Mode,
    pub match_case: bool,
    pub whole_word: bool,
    pub dot_matches_newline: bool,
}

pub enum Compiled {
    Rust(Regex),
    NeedsJs,
}

/// Expand Extended-mode escapes (\n \r \t \0 \\ \xHH \uHHHH). Unknown escapes keep their backslash.
pub fn expand_extended(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c != '\\' || i + 1 >= chars.len() {
            out.push(c);
            i += 1;
            continue;
        }
        let n = chars[i + 1];
        i += 2;
        match n {
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            '0' => out.push('\0'),
            '\\' => out.push('\\'),
            'x' | 'u' => {
                let len = if n == 'x' { 2 } else { 4 };
                let hex: String = chars.iter().skip(i).take(len).collect();
                match (hex.len() == len).then(|| u32::from_str_radix(&hex, 16).ok()).flatten() {
                    Some(v) => {
                        out.push(char::from_u32(v).unwrap_or('\u{FFFD}'));
                        i += len;
                    }
                    None => {
                        out.push('\\');
                        out.push(n);
                    }
                }
            }
            other => {
                out.push('\\');
                out.push(other);
            }
        }
    }
    out
}

/// Documents are LF-normalised (see files.rs), so CR / CRLF in a pattern or replacement means a line break.
pub fn normalize_line_breaks(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// True when the search cannot be run by the Rust engine with identical results.
pub fn needs_js_engine(pattern: &str, opts: &SearchOptions) -> bool {
    if opts.whole_word {
        if opts.mode == Mode::Regex {
            return true;
        }
        let text = if opts.mode == Mode::Extended { expand_extended(pattern) } else { pattern.to_string() };
        return !(text.chars().next().is_some_and(is_word) && text.chars().last().is_some_and(is_word));
    }
    if opts.mode != Mode::Regex {
        return false;
    }
    let chars: Vec<char> = pattern.chars().collect();
    let mut in_class = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' {
            if let Some(&n) = chars.get(i + 1) {
                if !in_class && (('1'..='9').contains(&n) || n == 'k') {
                    return true;
                }
            }
            i += 2;
            continue;
        }
        if in_class {
            if c == ']' {
                in_class = false;
            }
        } else if c == '[' {
            in_class = true;
        } else if c == '(' && chars.get(i + 1) == Some(&'?') {
            let a = chars.get(i + 2).copied();
            let b = chars.get(i + 3).copied();
            if matches!(a, Some('=') | Some('!') | Some('>')) || (a == Some('<') && matches!(b, Some('=') | Some('!'))) {
                return true;
            }
        }
        i += 1;
    }
    false
}

/// Translate Notepad++/PCRE-isms the Rust crate lacks (`\h`, `\R`, `\Z`).
pub fn translate_regex(pattern: &str) -> String {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::new();
    let mut in_class = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' {
            match chars.get(i + 1) {
                None => {
                    out.push('\\');
                    i += 1;
                }
                Some('r') => {
                    // \r\n, \r?\n and a lone \r all mean one line break against LF-normalised text.
                    i += 2;
                    if chars.get(i) == Some(&'\\') && chars.get(i + 1) == Some(&'n') {
                        i += 2;
                    } else if chars.get(i) == Some(&'?') && chars.get(i + 1) == Some(&'\\') && chars.get(i + 2) == Some(&'n') {
                        i += 3;
                    }
                    out.push_str("\\n");
                }
                Some('h') => {
                    out.push_str(if in_class { " \\t" } else { "[ \\t]" });
                    i += 2;
                }
                Some('R') if !in_class => {
                    out.push_str("(?:\\r\\n|\\n|\\r)");
                    i += 2;
                }
                Some('Z') if !in_class => {
                    out.push_str("\\n?\\z");
                    i += 2;
                }
                Some(&n) => {
                    out.push('\\');
                    out.push(n);
                    i += 2;
                }
            }
            continue;
        }
        if in_class {
            if c == ']' {
                in_class = false;
            }
        } else if c == '[' {
            in_class = true;
            out.push(c);
            i += 1;
            for lead in ['^', ']'] {
                if chars.get(i) == Some(&lead) {
                    out.push(lead);
                    i += 1;
                }
            }
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

/// Build the Rust regex source (without flags) for a search whose semantics Rust can match.
fn rust_source(pattern: &str, opts: &SearchOptions) -> String {
    let body = match opts.mode {
        Mode::Normal => regex::escape(pattern),
        Mode::Extended => regex::escape(&normalize_line_breaks(&expand_extended(pattern))),
        Mode::Regex => translate_regex(pattern),
    };
    if opts.whole_word {
        format!("\\b(?:{body})\\b")
    } else {
        body
    }
}

pub fn compile(pattern: &str, opts: &SearchOptions) -> Result<Compiled, String> {
    if needs_js_engine(pattern, opts) {
        return Ok(Compiled::NeedsJs);
    }
    // m: ^/$ at each line; R: treat \r\n as one line break, like the JS side's line terminators.
    let mut flags = String::from("mR");
    if !opts.match_case {
        flags.push('i');
    }
    if opts.mode == Mode::Regex && opts.dot_matches_newline {
        flags.push('s');
    }
    Regex::new(&format!("(?{flags}){}", rust_source(pattern, opts)))
        .map(Compiled::Rust)
        .map_err(|e| e.to_string())
}

/// Expand a replacement template for one match; `groups[0]` is the whole match.
pub fn expand_replacement(template: &str, groups: &[Option<&str>], mode: Mode) -> String {
    match mode {
        Mode::Normal => return template.to_string(),
        Mode::Extended => return normalize_line_breaks(&expand_extended(template)),
        Mode::Regex => {}
    }
    let chars: Vec<char> = template.chars().collect();
    let group = |d: char| groups.get(d.to_digit(10).unwrap() as usize).copied().flatten().unwrap_or("");
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '$' && next.is_some_and(|d| d.is_ascii_digit()) {
            out.push_str(group(next.unwrap()));
            i += 2;
        } else if c == '\\' && next.is_some() {
            let n = next.unwrap();
            match n {
                d if d.is_ascii_digit() => out.push_str(group(d)),
                'n' => out.push('\n'),
                'r' => {
                    // \r\n is one line break
                    if chars.get(i + 2) == Some(&'\\') && chars.get(i + 3) == Some(&'n') {
                        i += 2;
                    }
                    out.push('\n');
                }
                't' => out.push('\t'),
                '\\' => out.push('\\'),
                other => {
                    out.push('\\');
                    out.push(other);
                }
            }
            i += 2;
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const TABLE: &str = include_str!("../../shared/regex-cases.json");

    fn opts_of(c: &Value) -> SearchOptions {
        SearchOptions {
            mode: match c["mode"].as_str().unwrap() {
                "normal" => Mode::Normal,
                "extended" => Mode::Extended,
                _ => Mode::Regex,
            },
            match_case: c["matchCase"].as_bool().unwrap_or(false),
            whole_word: c["wholeWord"].as_bool().unwrap_or(false),
            dot_matches_newline: c["dotMatchesNewline"].as_bool().unwrap_or(false),
        }
    }

    #[test]
    fn shared_table_matching_agrees_with_the_js_engine() {
        let table: Value = serde_json::from_str(TABLE).unwrap();
        for c in table["matchCases"].as_array().unwrap() {
            let name = c["name"].as_str().unwrap();
            let opts = opts_of(c);
            let compiled = compile(c["pattern"].as_str().unwrap(), &opts).unwrap_or_else(|e| panic!("{name}: {e}"));
            if c["needsJs"].as_bool().unwrap_or(false) {
                assert!(matches!(compiled, Compiled::NeedsJs), "{name}: expected the JS fallback");
                continue;
            }
            let Compiled::Rust(re) = compiled else { panic!("{name}: unexpectedly needs JS") };
            let got: Vec<&str> = re.find_iter(c["text"].as_str().unwrap()).map(|m| m.as_str()).collect();
            let want: Vec<&str> = c["matches"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
            assert_eq!(got, want, "{name}");
        }
    }

    #[test]
    fn shared_table_replacement_agrees_with_the_js_engine() {
        let table: Value = serde_json::from_str(TABLE).unwrap();
        for c in table["replaceCases"].as_array().unwrap() {
            let name = c["name"].as_str().unwrap();
            let opts = opts_of(c);
            let Compiled::Rust(re) = compile(c["pattern"].as_str().unwrap(), &opts).unwrap() else {
                panic!("{name}: replacement cases must be Rust-eligible")
            };
            let text = c["text"].as_str().unwrap();
            let template = c["replacement"].as_str().unwrap();
            let mut out = String::new();
            let mut last = 0;
            for caps in re.captures_iter(text) {
                let whole = caps.get(0).unwrap();
                out.push_str(&text[last..whole.start()]);
                let groups: Vec<Option<&str>> = (0..caps.len()).map(|i| caps.get(i).map(|m| m.as_str())).collect();
                out.push_str(&expand_replacement(template, &groups, opts.mode));
                last = whole.end();
            }
            out.push_str(&text[last..]);
            assert_eq!(out, c["result"].as_str().unwrap(), "{name}");
        }
    }

    #[test]
    fn invalid_regex_is_an_error_not_a_panic() {
        let opts = SearchOptions { mode: Mode::Regex, match_case: false, whole_word: false, dot_matches_newline: false };
        assert!(compile("(unclosed", &opts).is_err());
    }

    #[test]
    fn expand_extended_handles_edge_cases() {
        assert_eq!(expand_extended("\\x41\\u00e9"), "Aé");
        assert_eq!(expand_extended("\\xZZ"), "\\xZZ");
        assert_eq!(expand_extended("a\\"), "a\\");
        assert_eq!(expand_extended("\\q"), "\\q");
    }

    #[test]
    fn crlf_files_match_line_end_anchors() {
        let opts = SearchOptions { mode: Mode::Regex, match_case: true, whole_word: false, dot_matches_newline: false };
        let Compiled::Rust(re) = compile("foo$", &opts).unwrap() else { panic!() };
        assert_eq!(re.find_iter("foo\r\nbar\r\nfoo").count(), 2);
    }

    #[test]
    fn needs_js_ignores_lookaround_text_inside_classes_and_escapes() {
        let opts = SearchOptions { mode: Mode::Regex, match_case: false, whole_word: false, dot_matches_newline: false };
        assert!(!needs_js_engine("[(?=]x", &opts));
        assert!(!needs_js_engine("\\(?=x", &opts));
        assert!(needs_js_engine("(?<a>x)\\k<a>", &opts));
    }
}
