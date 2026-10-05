//! Installing the `next-notepad` command and describing it to the Command Line Tool dialog (spec: cli-install, design D9).

use serde::Serialize;
use std::io;
use std::path::{Path, PathBuf};

pub const LINK_NAME: &str = "next-notepad";

/// A folder to put the link in, and whether it may be created.
#[derive(Debug, Clone)]
pub struct Target {
    pub dir: PathBuf,
    pub create: bool,
}

#[derive(Debug)]
pub enum InstallError {
    /// This folder cannot be used (missing or not writable); the next one may work.
    Unavailable(io::Error),
    /// Something we must not overwrite is in the way; stop and tell the user.
    Blocked(String),
}

/// Create (or refresh) `<dir>/next-notepad` as a symlink to `exe`. Only a symlink to a `next-notepad` file is replaced.
#[cfg(unix)]
pub fn install_to(target: &Target, exe: &Path) -> Result<PathBuf, InstallError> {
    use std::os::unix::fs::symlink;
    if target.create {
        std::fs::create_dir_all(&target.dir).map_err(InstallError::Unavailable)?;
    } else if !target.dir.is_dir() {
        return Err(InstallError::Unavailable(io::Error::new(io::ErrorKind::NotFound, "folder does not exist")));
    }
    let link = target.dir.join(LINK_NAME);
    match std::fs::symlink_metadata(&link) {
        Ok(meta) if meta.file_type().is_symlink() => {
            let ours = std::fs::read_link(&link).ok().and_then(|t| t.file_name().map(|n| n == LINK_NAME)).unwrap_or(false);
            if !ours {
                return Err(InstallError::Blocked(format!("{} is a link to something else, so it was left alone", link.display())));
            }
            std::fs::remove_file(&link).map_err(InstallError::Unavailable)?;
        }
        Ok(_) => return Err(InstallError::Blocked(format!("{} already exists and was not made by next-notepad, so it was left alone", link.display()))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(InstallError::Unavailable(e)),
    }
    symlink(exe, &link).map_err(InstallError::Unavailable)?;
    Ok(link)
}

#[cfg(not(unix))]
pub fn install_to(_target: &Target, _exe: &Path) -> Result<PathBuf, InstallError> {
    Err(InstallError::Blocked("installing the command is only supported on macOS and Linux".to_string()))
}

/// Try each target in order; the first that works wins. A blocked target stops the search.
pub fn install(targets: &[Target], exe: &Path) -> Result<PathBuf, String> {
    let mut last = String::from("no folder to install into");
    for t in targets {
        match install_to(t, exe) {
            Ok(link) => return Ok(link),
            Err(InstallError::Blocked(message)) => return Err(message),
            Err(InstallError::Unavailable(e)) => last = format!("{}: {e}", t.dir.display()),
        }
    }
    Err(format!("could not create the link ({last})"))
}

/// The folders to try: the system-wide one if it is writable, otherwise the user's own.
pub fn default_targets() -> Vec<Target> {
    let mut targets = vec![Target { dir: PathBuf::from("/usr/local/bin"), create: false }];
    if let Some(home) = std::env::var_os("HOME") {
        targets.push(Target { dir: PathBuf::from(home).join(".local").join("bin"), create: true });
    }
    targets
}

pub fn dir_on_path(dir: &Path, path_var: Option<&std::ffi::OsStr>) -> bool {
    path_var.map(|p| std::env::split_paths(p).any(|d| d == dir)).unwrap_or(false)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    pub exe_path: String,
    /// "mac", "windows" or "linux".
    pub platform: &'static str,
    pub can_install: bool,
    /// Where an installed link to this executable already is, if any.
    pub installed_link: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReport {
    pub link: String,
    pub dir: String,
    /// The line to add to a shell profile when the folder is not already on PATH.
    pub path_hint: Option<String>,
}

pub fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

/// A link in one of the usual folders that points at `exe`.
pub fn find_installed(targets: &[Target], exe: &Path) -> Option<PathBuf> {
    targets.iter().map(|t| t.dir.join(LINK_NAME)).find(|link| std::fs::read_link(link).map(|t| t == exe).unwrap_or(false))
}

fn report(link: PathBuf, path_var: Option<&std::ffi::OsStr>) -> InstallReport {
    let dir = link.parent().map(Path::to_path_buf).unwrap_or_default();
    // /usr/local/bin is on every standard PATH, and a GUI app's own PATH is often shorter than the shell's.
    let standard = dir == Path::new("/usr/local/bin");
    let path_hint = if standard || dir_on_path(&dir, path_var) {
        None
    } else {
        let shown = std::env::var_os("HOME").and_then(|h| dir.strip_prefix(h).ok().map(|rest| format!("$HOME/{}", rest.display()))).unwrap_or_else(|| dir.display().to_string());
        Some(format!("export PATH=\"{shown}:$PATH\""))
    };
    InstallReport { link: link.display().to_string(), dir: dir.display().to_string(), path_hint }
}

#[tauri::command]
pub fn cli_info() -> Result<CliInfo, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let installed_link = find_installed(&default_targets(), &exe).map(|p| p.display().to_string());
    Ok(CliInfo { exe_path: exe.display().to_string(), platform: platform(), can_install: cfg!(unix), installed_link })
}

#[tauri::command]
pub fn install_cli_command() -> Result<InstallReport, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let link = install(&default_targets(), &exe)?;
    Ok(report(link, std::env::var_os("PATH").as_deref()))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn target(dir: &Path, create: bool) -> Target {
        Target { dir: dir.to_path_buf(), create }
    }

    fn fake_exe(dir: &Path) -> PathBuf {
        let exe = dir.join("Next Notepad.app").join("Contents").join("MacOS").join("next-notepad");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, b"binary").unwrap();
        exe
    }

    #[test]
    fn installs_a_symlink_to_the_executable() {
        let tmp = tempfile::tempdir().unwrap();
        let (bin, exe) = (tmp.path().join("bin"), fake_exe(tmp.path()));
        std::fs::create_dir(&bin).unwrap();
        let link = install_to(&target(&bin, false), &exe).unwrap();
        assert_eq!(link, bin.join("next-notepad"));
        assert_eq!(std::fs::read_link(&link).unwrap(), exe);
    }

    #[test]
    fn a_folder_that_may_not_be_created_must_already_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let err = install_to(&target(&tmp.path().join("missing"), false), &fake_exe(tmp.path())).unwrap_err();
        assert!(matches!(err, InstallError::Unavailable(_)));
    }

    #[test]
    fn a_folder_that_may_be_created_is_created() {
        let tmp = tempfile::tempdir().unwrap();
        let deep = tmp.path().join("home").join(".local").join("bin");
        install_to(&target(&deep, true), &fake_exe(tmp.path())).unwrap();
        assert!(deep.join("next-notepad").exists());
    }

    #[test]
    fn replaces_its_own_old_link_after_the_app_moved() {
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let old = tmp.path().join("old").join("next-notepad");
        std::fs::create_dir_all(old.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&old, bin.join("next-notepad")).unwrap();
        let exe = fake_exe(tmp.path());
        install_to(&target(&bin, false), &exe).unwrap();
        assert_eq!(std::fs::read_link(bin.join("next-notepad")).unwrap(), exe);
    }

    #[test]
    fn never_overwrites_a_regular_file() {
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        std::fs::write(bin.join("next-notepad"), b"mine").unwrap();
        let err = install_to(&target(&bin, false), &fake_exe(tmp.path())).unwrap_err();
        assert!(matches!(err, InstallError::Blocked(m) if m.contains("left alone")));
        assert_eq!(std::fs::read(bin.join("next-notepad")).unwrap(), b"mine");
    }

    #[test]
    fn never_overwrites_a_link_to_something_else() {
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        std::os::unix::fs::symlink("/usr/bin/true", bin.join("next-notepad")).unwrap();
        assert!(matches!(install_to(&target(&bin, false), &fake_exe(tmp.path())), Err(InstallError::Blocked(_))));
        assert_eq!(std::fs::read_link(bin.join("next-notepad")).unwrap(), Path::new("/usr/bin/true"));
    }

    #[test]
    fn install_falls_back_to_the_next_folder_when_the_first_is_unavailable() {
        let tmp = tempfile::tempdir().unwrap();
        let exe = fake_exe(tmp.path());
        let targets = [target(&tmp.path().join("no-such-folder"), false), target(&tmp.path().join("home/.local/bin"), true)];
        let link = install(&targets, &exe).unwrap();
        assert_eq!(link, tmp.path().join("home/.local/bin/next-notepad"));
    }

    #[test]
    fn install_stops_at_a_blocked_folder_instead_of_falling_back() {
        let tmp = tempfile::tempdir().unwrap();
        let (first, second) = (tmp.path().join("first"), tmp.path().join("second"));
        std::fs::create_dir(&first).unwrap();
        std::fs::write(first.join("next-notepad"), b"x").unwrap();
        let err = install(&[target(&first, false), target(&second, true)], &fake_exe(tmp.path())).unwrap_err();
        assert!(err.contains("left alone"));
        assert!(!second.exists());
    }

    #[test]
    fn install_reports_when_no_folder_works() {
        let tmp = tempfile::tempdir().unwrap();
        let err = install(&[target(&tmp.path().join("nope"), false)], &fake_exe(tmp.path())).unwrap_err();
        assert!(err.contains("could not create the link"));
    }

    #[test]
    fn finds_an_existing_link_to_this_executable() {
        let tmp = tempfile::tempdir().unwrap();
        let (bin, exe) = (tmp.path().join("bin"), fake_exe(tmp.path()));
        std::fs::create_dir(&bin).unwrap();
        let t = [target(&bin, false)];
        assert_eq!(find_installed(&t, &exe), None);
        install_to(&t[0], &exe).unwrap();
        assert_eq!(find_installed(&t, &exe), Some(bin.join("next-notepad")));
        assert_eq!(find_installed(&t, &tmp.path().join("elsewhere")), None);
    }

    #[test]
    fn path_membership_is_checked_against_the_given_path_variable() {
        let path = std::env::join_paths(["/usr/bin", "/opt/x"]).unwrap();
        assert!(dir_on_path(Path::new("/opt/x"), Some(&path)));
        assert!(!dir_on_path(Path::new("/opt/y"), Some(&path)));
        assert!(!dir_on_path(Path::new("/opt/x"), None));
    }

    #[test]
    fn the_report_gives_a_path_hint_only_when_the_folder_is_not_on_path() {
        let path = std::env::join_paths(["/usr/bin"]).unwrap();
        let elsewhere = report(PathBuf::from("/opt/tools/next-notepad"), Some(&path));
        assert_eq!(elsewhere.path_hint.as_deref(), Some("export PATH=\"/opt/tools:$PATH\""));
        assert!(report(PathBuf::from("/usr/local/bin/next-notepad"), Some(&path)).path_hint.is_none());
        let on_path = std::env::join_paths(["/opt/tools"]).unwrap();
        assert!(report(PathBuf::from("/opt/tools/next-notepad"), Some(&on_path)).path_hint.is_none());
    }

    #[test]
    fn a_home_folder_is_written_with_dollar_home_in_the_hint() {
        if let Some(home) = std::env::var_os("HOME") {
            let link = PathBuf::from(&home).join(".local/bin/next-notepad");
            let r = report(link, Some(std::ffi::OsStr::new("/usr/bin")));
            assert_eq!(r.path_hint.as_deref(), Some("export PATH=\"$HOME/.local/bin:$PATH\""));
        }
    }
}
