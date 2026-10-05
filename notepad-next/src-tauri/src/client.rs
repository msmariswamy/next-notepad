//! The `next-notepad` command-line client (spec: cli-open-files, design D1, D4, D8).
//!
//! It finds the running app through `cli-server.json`, starting the app when needed, sends one request, and in wait
//! mode stays alive until the app says the files are done. It never creates a window.

use crate::cli::{Cli, USAGE};
use crate::cli_server::{read_server_file, ServerFile};
use crate::protocol::{read_line, resolve, Request, Response, MAX_LINE};
use std::io::{self, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

pub const EXIT_OK: i32 = 0;
pub const EXIT_FAILED: i32 = 1;
pub const EXIT_USAGE: i32 = 2;
pub const EXIT_UNREACHABLE: i32 = 3;

pub struct ClientEnv {
    pub server_file: PathBuf,
    pub cwd: PathBuf,
    /// Start the application, detached, with no arguments.
    pub spawn_app: Box<dyn Fn() -> io::Result<()>>,
    /// How long to wait for a freshly started app to accept requests.
    pub start_timeout: Duration,
    pub poll_interval: Duration,
    pub connect_timeout: Duration,
    /// How long the app has to answer `ok` after a request (it may be starting up).
    pub ack_timeout: Duration,
}

impl ClientEnv {
    pub fn new(server_file: PathBuf, cwd: PathBuf, spawn_app: Box<dyn Fn() -> io::Result<()>>) -> Self {
        ClientEnv {
            server_file,
            cwd,
            spawn_app,
            start_timeout: Duration::from_secs(10),
            poll_interval: Duration::from_millis(100),
            connect_timeout: Duration::from_millis(500),
            ack_timeout: Duration::from_secs(30),
        }
    }
}

fn try_connect(env: &ClientEnv) -> Option<(TcpStream, ServerFile)> {
    let file = read_server_file(&env.server_file)?;
    let stream = TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, file.port)), env.connect_timeout).ok()?;
    Some((stream, file))
}

/// Connect to the running app, starting it if there is none. A missing or stale server file just means "not running".
fn connect(env: &ClientEnv) -> Result<(TcpStream, ServerFile), String> {
    if let Some(found) = try_connect(env) {
        return Ok(found);
    }
    (env.spawn_app)().map_err(|e| format!("could not start next-notepad: {e}"))?;
    let deadline = Instant::now() + env.start_timeout;
    while Instant::now() < deadline {
        thread::sleep(env.poll_interval);
        if let Some(found) = try_connect(env) {
            return Ok(found);
        }
    }
    Err(format!("next-notepad did not start within {} seconds", env.start_timeout.as_secs().max(1)))
}

fn read_response(reader: &mut BufReader<TcpStream>) -> Result<Option<Response>, String> {
    match read_line(reader, MAX_LINE) {
        Ok(Some(line)) => serde_json::from_str(&line).map(Some).map_err(|_| "next-notepad sent an unreadable answer".to_string()),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Run the parsed command and return the process exit code. Output goes to `out` and `err` so tests can read it.
pub fn run(cli: Cli, env: &ClientEnv, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let (files, wait) = match cli {
        Cli::Gui => return EXIT_OK,
        Cli::Help => {
            let _ = out.write_all(USAGE.as_bytes());
            return EXIT_OK;
        }
        Cli::Version => {
            let _ = writeln!(out, "next-notepad {}", env!("CARGO_PKG_VERSION"));
            return EXIT_OK;
        }
        Cli::Usage(message) => {
            let _ = write!(err, "next-notepad: {message}\n\n{USAGE}");
            return EXIT_USAGE;
        }
        Cli::Open { files, wait } => (files, wait),
    };

    let (stream, server) = match connect(env) {
        Ok(found) => found,
        Err(message) => {
            let _ = writeln!(err, "next-notepad: {message}");
            return EXIT_UNREACHABLE;
        }
    };
    let request = Request {
        token: server.token,
        files: files.iter().map(|f| resolve(f, &env.cwd).to_string_lossy().into_owned()).collect(),
        wait,
        cwd: env.cwd.to_string_lossy().into_owned(),
    };
    let mut writer = match stream.try_clone() {
        Ok(w) => w,
        Err(e) => {
            let _ = writeln!(err, "next-notepad: {e}");
            return EXIT_UNREACHABLE;
        }
    };
    let line = format!("{}\n", serde_json::to_string(&request).expect("a Request always serialises"));
    if let Err(e) = writer.write_all(line.as_bytes()).and_then(|_| writer.flush()) {
        let _ = writeln!(err, "next-notepad: could not send the request: {e}");
        return EXIT_UNREACHABLE;
    }

    let _ = stream.set_read_timeout(Some(env.ack_timeout));
    let mut reader = BufReader::new(stream);
    let fail = |err: &mut dyn Write, message: &str| {
        let _ = writeln!(err, "next-notepad: {message}");
        EXIT_FAILED
    };
    match read_response(&mut reader) {
        Ok(Some(Response { error: Some(message), .. })) => return fail(err, &message),
        Ok(Some(Response { ok: Some(true), .. })) => {}
        Ok(Some(_)) => return fail(err, "next-notepad sent an unexpected answer"),
        Ok(None) => return fail(err, "next-notepad closed the connection before opening the files"),
        Err(message) => return fail(err, &format!("no answer from next-notepad: {message}")),
    }
    if !wait {
        return EXIT_OK;
    }
    // The user may take as long as they like; only the app closing the connection ends the wait early.
    let _ = reader.get_ref().set_read_timeout(None);
    match read_response(&mut reader) {
        Ok(Some(Response { done: Some(true), .. })) => EXIT_OK,
        Ok(Some(Response { error: Some(message), .. })) => fail(err, &message),
        Ok(Some(_)) => fail(err, "next-notepad sent an unexpected answer"),
        Ok(None) | Err(_) => fail(err, "next-notepad closed before you finished editing; the file may not have been saved"),
    }
}

/// Start the application as a separate, detached process with no arguments (so it runs as the GUI).
pub fn spawn_detached_app() -> io::Result<()> {
    let exe = std::env::current_exe()?;
    let mut cmd = std::process::Command::new(exe);
    cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Its own process group, so closing the terminal that ran the command does not kill the app.
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    cmd.spawn().map(|_| ())
}

/// On Windows the release build has no console; attach to the parent's so help and errors appear in the terminal.
#[cfg(windows)]
fn attach_parent_console() {
    use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    // SAFETY: AttachConsole has no memory-safety preconditions; failure (no parent console) is simply ignored.
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

/// Attaching to the parent console is not enough for a GUI-subsystem process: its standard handles are still null
/// unless the caller redirected them. In that case write to the console directly through `CONOUT$`.
#[cfg(windows)]
fn console_writers() -> (Box<dyn Write>, Box<dyn Write>) {
    use windows_sys::Win32::System::Console::{GetStdHandle, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE};
    let valid = |kind| {
        // SAFETY: GetStdHandle only reads the process's standard handle table.
        let handle = unsafe { GetStdHandle(kind) };
        !handle.is_null() && handle as isize != -1
    };
    let console = || -> Box<dyn Write> {
        match std::fs::OpenOptions::new().write(true).open("CONOUT$") {
            Ok(file) => Box::new(file),
            Err(_) => Box::new(io::sink()),
        }
    };
    let out: Box<dyn Write> = if valid(STD_OUTPUT_HANDLE) { Box::new(io::stdout()) } else { console() };
    let err: Box<dyn Write> = if valid(STD_ERROR_HANDLE) { Box::new(io::stderr()) } else { console() };
    (out, err)
}

#[cfg(not(windows))]
fn console_writers() -> (Box<dyn Write>, Box<dyn Write>) {
    (Box::new(io::stdout()), Box::new(io::stderr()))
}

/// Entry point for command-line use: returns the exit code.
pub fn main_client(cli: Cli) -> i32 {
    #[cfg(windows)]
    attach_parent_console();
    let server_file = crate::cli_server::default_server_file().unwrap_or_else(|| PathBuf::from("cli-server.json"));
    let cwd = std::env::current_dir().unwrap_or_default();
    let env = ClientEnv::new(server_file, cwd, Box::new(spawn_detached_app));
    let (mut out, mut err) = console_writers();
    run(cli, &env, &mut out, &mut err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_server::{Server, Sink};
    use std::sync::{Arc, Mutex, OnceLock};

    /// Answers requests the way the app would: open them, and in wait mode finish after `finish_after`.
    #[derive(Default)]
    struct AutoSink {
        server: OnceLock<Arc<Server>>,
        error: Option<String>,
        finish_after: Option<Duration>,
        shutdown_instead: bool,
        seen: Mutex<Vec<(Vec<String>, bool)>>,
    }

    impl Sink for AutoSink {
        fn open(&self, id: u64, files: Vec<String>, wait: bool) {
            self.seen.lock().unwrap().push((files, wait));
            let server = self.server.get().unwrap().clone();
            let error = self.error.clone();
            let (finish_after, shutdown) = (self.finish_after, self.shutdown_instead);
            thread::spawn(move || {
                server.opened(id, error);
                if let Some(d) = finish_after {
                    thread::sleep(d);
                    if shutdown {
                        server.shutdown();
                    } else {
                        server.finish(id);
                    }
                }
            });
        }
    }

    fn start(dir: &std::path::Path, sink: Arc<AutoSink>) -> Arc<Server> {
        let server = Arc::new(Server::start(dir.join("cli-server.json"), sink.clone()).unwrap());
        let _ = sink.server.set(server.clone());
        server
    }

    fn env(dir: &std::path::Path) -> ClientEnv {
        let mut e = ClientEnv::new(dir.join("cli-server.json"), PathBuf::from(if cfg!(windows) { "C:\\work" } else { "/work" }), Box::new(|| Err(io::Error::other("no app in tests"))));
        e.start_timeout = Duration::from_millis(300);
        e.poll_interval = Duration::from_millis(20);
        e
    }

    fn open(files: &[&str], wait: bool) -> Cli {
        Cli::Open { files: files.iter().map(|s| s.to_string()).collect(), wait }
    }

    fn run_capture(cli: Cli, env: &ClientEnv) -> (i32, String, String) {
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let code = run(cli, env, &mut out, &mut err);
        (code, String::from_utf8(out).unwrap(), String::from_utf8(err).unwrap())
    }

    #[test]
    fn help_prints_usage_and_exits_zero() {
        let dir = tempfile::tempdir().unwrap();
        let (code, out, _) = run_capture(Cli::Help, &env(dir.path()));
        assert_eq!(code, EXIT_OK);
        assert!(out.contains("Usage: next-notepad"));
    }

    #[test]
    fn version_prints_the_package_version() {
        let dir = tempfile::tempdir().unwrap();
        let (code, out, _) = run_capture(Cli::Version, &env(dir.path()));
        assert_eq!((code, out), (EXIT_OK, format!("next-notepad {}\n", env!("CARGO_PKG_VERSION"))));
    }

    #[test]
    fn a_usage_error_goes_to_stderr_with_exit_2() {
        let dir = tempfile::tempdir().unwrap();
        let (code, out, err) = run_capture(Cli::Usage("unknown option: --nope".into()), &env(dir.path()));
        assert_eq!(code, EXIT_USAGE);
        assert!(out.is_empty());
        assert!(err.contains("unknown option: --nope") && err.contains("Usage:"));
    }

    #[test]
    fn opening_files_sends_absolute_paths_and_exits_zero_without_waiting() {
        let dir = tempfile::tempdir().unwrap();
        let sink = Arc::new(AutoSink::default());
        let server = start(dir.path(), sink.clone());
        let started = Instant::now();
        let (code, _, err) = run_capture(open(&["notes.txt", "./sub/../b.txt", if cfg!(windows) { "C:\\abs.txt" } else { "/abs.txt" }], false), &env(dir.path()));
        assert_eq!((code, err.as_str()), (EXIT_OK, ""));
        assert!(started.elapsed() < Duration::from_secs(5));
        let (files, wait) = sink.seen.lock().unwrap()[0].clone();
        assert!(!wait);
        let sep = std::path::MAIN_SEPARATOR;
        assert_eq!(files[0], format!("{}{sep}notes.txt", if cfg!(windows) { "C:\\work" } else { "/work" }));
        assert_eq!(files[1], format!("{}{sep}b.txt", if cfg!(windows) { "C:\\work" } else { "/work" }));
        assert_eq!(files[2], if cfg!(windows) { "C:\\abs.txt" } else { "/abs.txt" });
        server.shutdown();
    }

    #[test]
    fn wait_mode_blocks_until_the_app_says_done() {
        let dir = tempfile::tempdir().unwrap();
        let sink = Arc::new(AutoSink { finish_after: Some(Duration::from_millis(300)), ..Default::default() });
        let server = start(dir.path(), sink);
        let started = Instant::now();
        let (code, _, err) = run_capture(open(&["f.yaml"], true), &env(dir.path()));
        assert_eq!((code, err.as_str()), (EXIT_OK, ""));
        assert!(started.elapsed() >= Duration::from_millis(300), "returned before done");
        server.shutdown();
    }

    #[test]
    fn an_error_from_the_app_is_printed_with_exit_1() {
        let dir = tempfile::tempdir().unwrap();
        let sink = Arc::new(AutoSink { error: Some("cannot open /dir".into()), ..Default::default() });
        let server = start(dir.path(), sink);
        let (code, _, err) = run_capture(open(&["/dir"], true), &env(dir.path()));
        assert_eq!(code, EXIT_FAILED);
        assert!(err.contains("cannot open /dir"));
        server.shutdown();
    }

    #[test]
    fn a_connection_that_drops_before_done_exits_1_with_a_message() {
        let dir = tempfile::tempdir().unwrap();
        let sink = Arc::new(AutoSink { finish_after: Some(Duration::from_millis(100)), shutdown_instead: true, ..Default::default() });
        let _server = start(dir.path(), sink);
        let (code, _, err) = run_capture(open(&["f.yaml"], true), &env(dir.path()));
        assert_eq!(code, EXIT_FAILED);
        assert!(err.contains("closed before you finished editing"));
    }

    #[test]
    fn a_wrong_token_in_the_server_file_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let sink = Arc::new(AutoSink::default());
        let server = start(dir.path(), sink);
        let mut file = read_server_file(&dir.path().join("cli-server.json")).unwrap();
        file.token = "stale".into();
        crate::cli_server::write_server_file(&dir.path().join("cli-server.json"), &file).unwrap();
        let (code, _, err) = run_capture(open(&["a"], false), &env(dir.path()));
        assert_eq!(code, EXIT_FAILED);
        assert!(err.contains("wrong token"));
        server.shutdown();
    }

    #[test]
    fn with_no_server_file_the_app_is_started_and_then_used() {
        let dir = tempfile::tempdir().unwrap();
        let sink = Arc::new(AutoSink::default());
        let started: Arc<Mutex<Option<Arc<Server>>>> = Arc::new(Mutex::new(None));
        let (spawn_dir, spawn_sink, spawn_slot) = (dir.path().to_path_buf(), sink.clone(), started.clone());
        let mut e = env(dir.path());
        let calls = Arc::new(Mutex::new(0));
        let spawn_calls = calls.clone();
        e.spawn_app = Box::new(move || {
            *spawn_calls.lock().unwrap() += 1;
            let (dir, sink, slot) = (spawn_dir.clone(), spawn_sink.clone(), spawn_slot.clone());
            // The "app" takes a moment to come up.
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(80));
                *slot.lock().unwrap() = Some(start(&dir, sink));
            });
            Ok(())
        });
        let (code, _, err) = run_capture(open(&["a.txt"], false), &e);
        assert_eq!((code, err.as_str()), (EXIT_OK, ""));
        assert_eq!(*calls.lock().unwrap(), 1);
        assert_eq!(sink.seen.lock().unwrap().len(), 1);
        let running = started.lock().unwrap().take();
        if let Some(s) = running {
            s.shutdown();
        }
    }

    #[test]
    fn a_stale_server_file_counts_as_not_running() {
        let dir = tempfile::tempdir().unwrap();
        // A port that was just closed: connecting is refused.
        let port = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap().local_addr().unwrap().port();
        crate::cli_server::write_server_file(&dir.path().join("cli-server.json"), &ServerFile { port, token: "old".into(), pid: 1 }).unwrap();
        let spawned = Arc::new(Mutex::new(false));
        let flag = spawned.clone();
        let mut e = env(dir.path());
        e.spawn_app = Box::new(move || {
            *flag.lock().unwrap() = true;
            Err(io::Error::other("boom"))
        });
        let (code, _, err) = run_capture(open(&["a"], false), &e);
        assert!(*spawned.lock().unwrap());
        assert_eq!(code, EXIT_UNREACHABLE);
        assert!(err.contains("could not start next-notepad: boom"));
    }

    #[test]
    fn an_app_that_never_comes_up_exits_3_after_the_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let mut e = env(dir.path());
        e.spawn_app = Box::new(|| Ok(()));
        let started = Instant::now();
        let (code, _, err) = run_capture(open(&["a"], false), &e);
        assert_eq!(code, EXIT_UNREACHABLE);
        assert!(err.contains("did not start"));
        assert!(started.elapsed() >= Duration::from_millis(300));
    }
}
