//! Command-line arguments of the `next-notepad` command (spec: cli-open-files).

/// What the process was asked to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Cli {
    /// No arguments: start the application window.
    Gui,
    Help,
    Version,
    Open { files: Vec<String>, wait: bool },
    /// A usage error with the message to show.
    Usage(String),
}

pub const USAGE: &str = "\
Usage: next-notepad [--wait | -w] <file>...
       next-notepad --help | --version

Open files in next-notepad, starting it if it is not running.

Options:
  -w, --wait     Do not exit until the files are closed (for use as $EDITOR,
                 $KUBE_EDITOR or $GIT_EDITOR)
  -h, --help     Show this help
  -V, --version  Show the version

Exit codes: 0 success, 1 failure, 2 usage error, 3 next-notepad could not be started or reached.
";

/// Parse the arguments after the program name. macOS's legacy `-psn_...` argument is ignored.
pub fn parse<I: IntoIterator<Item = String>>(args: I) -> Cli {
    let args: Vec<String> = args.into_iter().filter(|a| !a.starts_with("-psn_")).collect();
    if args.is_empty() {
        return Cli::Gui;
    }
    let mut files = Vec::new();
    let mut wait = false;
    let mut flags_done = false;
    for a in args {
        if flags_done || !a.starts_with('-') || a == "-" {
            files.push(a);
            continue;
        }
        match a.as_str() {
            "--" => flags_done = true,
            "-h" | "--help" => return Cli::Help,
            "-V" | "--version" => return Cli::Version,
            "-w" | "--wait" => wait = true,
            other => return Cli::Usage(format!("unknown option: {other}")),
        }
    }
    if files.is_empty() {
        return Cli::Usage(if wait { "--wait needs at least one file".to_string() } else { "no files given".to_string() });
    }
    Cli::Open { files, wait }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(args: &[&str]) -> Cli {
        parse(args.iter().map(|s| s.to_string()))
    }

    #[test]
    fn no_arguments_starts_the_gui() {
        assert_eq!(p(&[]), Cli::Gui);
    }

    #[test]
    fn macos_legacy_process_serial_argument_is_ignored() {
        assert_eq!(p(&["-psn_0_12345"]), Cli::Gui);
        assert_eq!(p(&["-psn_0_1", "a.txt"]), Cli::Open { files: vec!["a.txt".into()], wait: false });
    }

    #[test]
    fn files_without_flags() {
        assert_eq!(p(&["a.txt", "b.txt"]), Cli::Open { files: vec!["a.txt".into(), "b.txt".into()], wait: false });
    }

    #[test]
    fn wait_in_long_and_short_form_before_or_after_the_files() {
        for args in [&["--wait", "f"][..], &["-w", "f"], &["f", "--wait"], &["f", "-w"]] {
            assert_eq!(p(args), Cli::Open { files: vec!["f".into()], wait: true }, "{args:?}");
        }
    }

    #[test]
    fn help_and_version() {
        assert_eq!(p(&["--help"]), Cli::Help);
        assert_eq!(p(&["-h"]), Cli::Help);
        assert_eq!(p(&["--version"]), Cli::Version);
        assert_eq!(p(&["-V"]), Cli::Version);
        assert_eq!(p(&["a.txt", "--help"]), Cli::Help);
    }

    #[test]
    fn unknown_flag_is_a_usage_error() {
        assert_eq!(p(&["--nope"]), Cli::Usage("unknown option: --nope".into()));
        assert_eq!(p(&["-x", "a"]), Cli::Usage("unknown option: -x".into()));
    }

    #[test]
    fn wait_without_files_is_a_usage_error() {
        assert_eq!(p(&["--wait"]), Cli::Usage("--wait needs at least one file".into()));
    }

    #[test]
    fn double_dash_makes_the_rest_files_even_when_they_start_with_a_dash() {
        assert_eq!(p(&["--wait", "--", "-odd.txt"]), Cli::Open { files: vec!["-odd.txt".into()], wait: true });
    }

    #[test]
    fn a_lone_dash_is_a_file_name() {
        assert_eq!(p(&["-"]), Cli::Open { files: vec!["-".into()], wait: false });
    }

    #[test]
    fn usage_text_mentions_the_options_and_exit_codes() {
        for needle in ["--wait", "--help", "--version", "Exit codes"] {
            assert!(USAGE.contains(needle), "{needle}");
        }
    }
}
