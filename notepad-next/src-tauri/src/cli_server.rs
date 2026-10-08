//! The loopback server inside the app that the `next-notepad` command talks to (ADR-0009, spec: cli-open-files).
//!
//! It listens on 127.0.0.1 only, publishes its port and a random token in `cli-server.json` (owner-only on Unix),
//! rejects requests with a wrong token, and keeps a connection open in wait mode until the app says the files are done.

use crate::files::atomic_write;
use crate::protocol::{read_line, Request, Response, MAX_LINE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, BufReader, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// How long a client has to send its request line after connecting.
pub const FIRST_LINE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerFile {
    pub port: u16,
    pub token: String,
    pub pid: u32,
}

/// The bundle identifier from `tauri.conf.json`; Tauri's app-data directory is named after it on every platform.
pub const APP_ID: &str = "com.nextnotepad.app";

/// Where the server file lives, computed without Tauri so the command-line client (which starts no app) finds the
/// same file as the app does: Tauri's `app_data_dir` for this identifier on macOS, Windows and Linux.
pub fn default_server_file() -> Option<PathBuf> {
    let base = if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME")?).join("Library").join("Application Support")
    } else if cfg!(windows) {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else {
        match std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
            Some(dir) => PathBuf::from(dir),
            None => PathBuf::from(std::env::var_os("HOME")?).join(".local").join("share"),
        }
    };
    Some(base.join(APP_ID).join("cli-server.json"))
}

/// 128 random bits as hex, from the operating system.
pub fn random_token() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("the operating system provides random bytes");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn write_server_file(path: &Path, file: &ServerFile) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_vec(file).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    atomic_write(path, &json).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    // The token is a credential for this user's app, so nobody else may read it.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

/// The server file, or `None` when it is missing or unreadable (the app is not running, or crashed).
pub fn read_server_file(path: &Path) -> Option<ServerFile> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

/// Receives accepted requests. The app implements it by telling the frontend to open the files.
pub trait Sink: Send + Sync + 'static {
    fn open(&self, id: u64, files: Vec<String>, wait: bool);
}

struct Conn {
    stream: TcpStream,
    wait: bool,
}

struct Inner {
    token: String,
    path: PathBuf,
    sink: Arc<dyn Sink>,
    conns: Mutex<HashMap<u64, Conn>>,
    next_id: AtomicU64,
    stopping: AtomicBool,
    first_line_timeout: Duration,
}

pub struct Server {
    inner: Arc<Inner>,
    addr: SocketAddr,
}

fn send(stream: &mut TcpStream, response: &Response) {
    // The client may already be gone (for example `kubectl` was interrupted); there is nobody to tell.
    let _ = stream.write_all(response.to_line().as_bytes());
    let _ = stream.flush();
}

impl Server {
    pub fn start(path: PathBuf, sink: Arc<dyn Sink>) -> io::Result<Server> {
        Self::start_with(path, sink, FIRST_LINE_TIMEOUT)
    }

    pub fn start_with(path: PathBuf, sink: Arc<dyn Sink>, first_line_timeout: Duration) -> io::Result<Server> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let addr = listener.local_addr()?;
        let inner = Arc::new(Inner {
            token: random_token(),
            path,
            sink,
            conns: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            stopping: AtomicBool::new(false),
            first_line_timeout,
        });
        write_server_file(&inner.path, &ServerFile { port: addr.port(), token: inner.token.clone(), pid: std::process::id() })?;
        let accept_inner = inner.clone();
        thread::Builder::new().name("cli-server".into()).spawn(move || {
            for stream in listener.incoming() {
                if accept_inner.stopping.load(Ordering::SeqCst) {
                    break;
                }
                if let Ok(stream) = stream {
                    let inner = accept_inner.clone();
                    thread::spawn(move || handle(inner, stream));
                }
            }
        })?;
        Ok(Server { inner, addr })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn token(&self) -> &str {
        &self.inner.token
    }

    /// The frontend has opened the request's files (or failed to). Answers the client; a request without
    /// `wait`, or one that failed, is finished here.
    pub fn opened(&self, id: u64, error: Option<String>) {
        let mut conns = self.inner.conns.lock().unwrap();
        let Some(conn) = conns.get_mut(&id) else { return };
        match error {
            Some(message) => {
                send(&mut conn.stream, &Response::error(message));
                let _ = conn.stream.shutdown(Shutdown::Both);
                conns.remove(&id);
            }
            None => {
                send(&mut conn.stream, &Response::ok());
                if !conn.wait {
                    let _ = conn.stream.shutdown(Shutdown::Both);
                    conns.remove(&id);
                }
            }
        }
    }

    /// The user is done with a waiting request's files.
    pub fn finish(&self, id: u64) {
        let mut conns = self.inner.conns.lock().unwrap();
        if let Some(mut conn) = conns.remove(&id) {
            send(&mut conn.stream, &Response::done());
            let _ = conn.stream.shutdown(Shutdown::Both);
        }
    }

    /// The app is quitting normally: every waiting client is done.
    pub fn finish_all(&self) {
        let ids: Vec<u64> = self.inner.conns.lock().unwrap().keys().copied().collect();
        for id in ids {
            self.finish(id);
        }
    }

    /// Stop accepting, forget the server file. Waiting connections are dropped, which clients report as a crash,
    /// so a normal quit calls [`Server::finish_all`] first.
    pub fn shutdown(&self) {
        self.inner.stopping.store(true, Ordering::SeqCst);
        let _ = std::fs::remove_file(&self.inner.path);
        // Wake the accept loop so it notices the flag.
        let _ = TcpStream::connect_timeout(&self.addr, Duration::from_millis(200));
        for (_, conn) in self.inner.conns.lock().unwrap().drain() {
            let _ = conn.stream.shutdown(Shutdown::Both);
        }
    }
}

fn handle(inner: Arc<Inner>, stream: TcpStream) {
    let mut out = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let _ = stream.set_read_timeout(Some(inner.first_line_timeout));
    let mut reader = BufReader::new(stream);
    let fail = |out: &mut TcpStream, message: &str| {
        send(out, &Response::error(message));
        let _ = out.shutdown(Shutdown::Both);
    };
    let line = match read_line(&mut reader, MAX_LINE) {
        Ok(Some(line)) => line,
        Ok(None) => return,
        Err(e) if e.kind() == io::ErrorKind::InvalidData => return fail(&mut out, "request is too large"),
        Err(_) => return fail(&mut out, "no request received in time"),
    };
    let request: Request = match serde_json::from_str(&line) {
        Ok(r) => r,
        Err(_) => return fail(&mut out, "request is not valid"),
    };
    if request.token != inner.token {
        return fail(&mut out, "wrong token");
    }
    if request.files.is_empty() {
        return fail(&mut out, "no files given");
    }
    let _ = reader.get_ref().set_read_timeout(None);
    let id = inner.next_id.fetch_add(1, Ordering::SeqCst);
    match out.try_clone() {
        Ok(stream) => {
            inner.conns.lock().unwrap().insert(id, Conn { stream, wait: request.wait });
        }
        Err(_) => return,
    }
    inner.sink.open(id, request.files, request.wait);
}

/// Holds requests until the frontend is ready, then passes them on in order (spec: "Requests during start-up are queued").
pub struct QueuedSink {
    target: Arc<dyn Sink>,
    state: Mutex<(bool, Vec<(u64, Vec<String>, bool)>)>,
}

impl QueuedSink {
    pub fn new(target: Arc<dyn Sink>) -> Self {
        QueuedSink { target, state: Mutex::new((false, Vec::new())) }
    }

    /// The window is ready: deliver what arrived so far, then deliver everything immediately.
    pub fn ready(&self) {
        let queued = {
            let mut state = self.state.lock().unwrap();
            state.0 = true;
            std::mem::take(&mut state.1)
        };
        for (id, files, wait) in queued {
            self.target.open(id, files, wait);
        }
    }
}

impl Sink for QueuedSink {
    fn open(&self, id: u64, files: Vec<String>, wait: bool) {
        let mut state = self.state.lock().unwrap();
        if state.0 {
            drop(state);
            self.target.open(id, files, wait);
        } else {
            state.1.push((id, files, wait));
        }
    }
}

/// Files the operating system hands to the app (macOS "open" events) can arrive before the app has finished setting up,
/// when there is no queue to put them in yet. This holds them, then lets them through once the app is live.
pub struct EarlyOpens(Mutex<Option<Vec<Vec<String>>>>);

impl EarlyOpens {
    pub const fn new() -> Self {
        EarlyOpens(Mutex::new(Some(Vec::new())))
    }

    /// Before [`EarlyOpens::go_live`] the files are kept and `None` is returned; afterwards they are handed straight back
    /// for the caller to deliver.
    pub fn offer(&self, files: Vec<String>) -> Option<Vec<String>> {
        match self.0.lock().unwrap().as_mut() {
            Some(held) => {
                held.push(files);
                None
            }
            None => Some(files),
        }
    }

    /// The app is set up: return everything held so far, in arrival order, and stop holding.
    pub fn go_live(&self) -> Vec<Vec<String>> {
        self.0.lock().unwrap().take().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, Read};
    use std::sync::mpsc::{channel, Receiver, Sender};

    struct TestSink(Mutex<Sender<(u64, Vec<String>, bool)>>);
    impl Sink for TestSink {
        fn open(&self, id: u64, files: Vec<String>, wait: bool) {
            let _ = self.0.lock().unwrap().send((id, files, wait));
        }
    }

    type Opened = Receiver<(u64, Vec<String>, bool)>;

    fn start(dir: &Path) -> (Server, Opened) {
        let (tx, rx) = channel();
        let server = Server::start(dir.join("cli-server.json"), Arc::new(TestSink(Mutex::new(tx)))).unwrap();
        (server, rx)
    }

    fn connect(server: &Server) -> (TcpStream, BufReader<TcpStream>) {
        let stream = TcpStream::connect(server.addr()).unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let reader = BufReader::new(stream.try_clone().unwrap());
        (stream, reader)
    }

    fn request(server: &Server, files: &[&str], wait: bool) -> String {
        let r = Request { token: server.token().to_string(), files: files.iter().map(|s| s.to_string()).collect(), wait, cwd: "/w".into() };
        format!("{}\n", serde_json::to_string(&r).unwrap())
    }

    fn reply(reader: &mut BufReader<TcpStream>) -> Option<Response> {
        read_line(reader, MAX_LINE).ok().flatten().map(|l| serde_json::from_str(&l).unwrap())
    }

    const WAIT: Duration = Duration::from_secs(5);

    #[test]
    fn the_server_file_holds_port_token_and_pid_and_is_owner_only() {
        let dir = tempfile::tempdir().unwrap();
        let (server, _rx) = start(dir.path());
        let file = read_server_file(&dir.path().join("cli-server.json")).unwrap();
        assert_eq!(file, ServerFile { port: server.addr().port(), token: server.token().to_string(), pid: std::process::id() });
        assert_eq!(file.token.len(), 32);
        assert!(file.token.chars().all(|c| c.is_ascii_hexdigit()));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.path().join("cli-server.json")).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        server.shutdown();
    }

    #[test]
    fn the_app_id_matches_tauri_conf_json() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"], APP_ID);
    }

    #[test]
    fn the_default_server_file_is_named_after_the_app_id() {
        let path = default_server_file().expect("HOME or APPDATA is set in the test environment");
        assert!(path.ends_with(Path::new(APP_ID).join("cli-server.json")));
    }

    #[test]
    fn tokens_differ_between_servers() {
        assert_ne!(random_token(), random_token());
    }

    #[test]
    fn shutdown_removes_the_server_file() {
        let dir = tempfile::tempdir().unwrap();
        let (server, _rx) = start(dir.path());
        server.shutdown();
        assert!(!dir.path().join("cli-server.json").exists());
    }

    #[test]
    fn a_missing_or_garbled_server_file_reads_as_none() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_server_file(&dir.path().join("none.json")).is_none());
        std::fs::write(dir.path().join("bad.json"), b"{ not json").unwrap();
        assert!(read_server_file(&dir.path().join("bad.json")).is_none());
    }

    #[test]
    fn it_listens_on_the_loopback_interface_only() {
        let dir = tempfile::tempdir().unwrap();
        let (server, _rx) = start(dir.path());
        assert!(server.addr().ip().is_loopback());
        server.shutdown();
    }

    #[test]
    fn a_good_request_reaches_the_sink_and_gets_ok_once_opened() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let (mut stream, mut reader) = connect(&server);
        stream.write_all(request(&server, &["/a.txt", "/b.txt"], false).as_bytes()).unwrap();
        let (id, files, wait) = rx.recv_timeout(WAIT).unwrap();
        assert_eq!((files, wait), (vec!["/a.txt".to_string(), "/b.txt".to_string()], false));
        server.opened(id, None);
        assert_eq!(reply(&mut reader), Some(Response::ok()));
        assert_eq!(reply(&mut reader), None, "a request without wait is closed after ok");
        server.shutdown();
    }

    #[test]
    fn in_wait_mode_done_follows_only_after_finish() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let (mut stream, mut reader) = connect(&server);
        stream.write_all(request(&server, &["/f.yaml"], true).as_bytes()).unwrap();
        let (id, _, wait) = rx.recv_timeout(WAIT).unwrap();
        assert!(wait);
        server.opened(id, None);
        assert_eq!(reply(&mut reader), Some(Response::ok()));
        stream.set_read_timeout(Some(Duration::from_millis(200))).unwrap();
        reader.get_ref().set_read_timeout(Some(Duration::from_millis(200))).unwrap();
        assert!(read_line(&mut reader, MAX_LINE).is_err(), "no done before finish");
        reader.get_ref().set_read_timeout(Some(WAIT)).unwrap();
        server.finish(id);
        assert_eq!(reply(&mut reader), Some(Response::done()));
        server.shutdown();
    }

    #[test]
    fn an_open_failure_is_reported_and_closes_the_connection() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let (mut stream, mut reader) = connect(&server);
        stream.write_all(request(&server, &["/dir"], true).as_bytes()).unwrap();
        let (id, _, _) = rx.recv_timeout(WAIT).unwrap();
        server.opened(id, Some("cannot open /dir".into()));
        assert_eq!(reply(&mut reader), Some(Response::error("cannot open /dir")));
        assert_eq!(reply(&mut reader), None);
        server.shutdown();
    }

    #[test]
    fn a_wrong_token_is_rejected_and_opens_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let (mut stream, mut reader) = connect(&server);
        let bad = Request { token: "nope".into(), files: vec!["/a".into()], wait: false, cwd: String::new() };
        stream.write_all(format!("{}\n", serde_json::to_string(&bad).unwrap()).as_bytes()).unwrap();
        assert_eq!(reply(&mut reader), Some(Response::error("wrong token")));
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
        server.shutdown();
    }

    #[test]
    fn malformed_and_empty_requests_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        for (line, message) in [("this is not json\n".to_string(), "request is not valid"), (request(&server, &[], false), "no files given")] {
            let (mut stream, mut reader) = connect(&server);
            stream.write_all(line.as_bytes()).unwrap();
            assert_eq!(reply(&mut reader), Some(Response::error(message)));
        }
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
        server.shutdown();
    }

    #[test]
    fn an_oversized_line_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let (server, _rx) = start(dir.path());
        let (mut stream, mut reader) = connect(&server);
        let big = vec![b'x'; MAX_LINE + 10];
        let _ = stream.write_all(&big);
        assert_eq!(reply(&mut reader), Some(Response::error("request is too large")));
        server.shutdown();
    }

    #[test]
    fn a_client_that_sends_nothing_is_dropped_after_the_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let (tx, _rx) = channel();
        let server = Server::start_with(dir.path().join("cli-server.json"), Arc::new(TestSink(Mutex::new(tx))), Duration::from_millis(100)).unwrap();
        let (_stream, mut reader) = connect(&server);
        assert_eq!(reply(&mut reader), Some(Response::error("no request received in time")));
        server.shutdown();
    }

    #[test]
    fn finish_all_ends_every_waiting_request() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let mut readers = Vec::new();
        for f in ["/a", "/b"] {
            let (mut stream, reader) = connect(&server);
            stream.write_all(request(&server, &[f], true).as_bytes()).unwrap();
            let (id, _, _) = rx.recv_timeout(WAIT).unwrap();
            server.opened(id, None);
            readers.push((stream, reader));
        }
        server.finish_all();
        for (_, reader) in &mut readers {
            assert_eq!(reply(reader), Some(Response::ok()));
            assert_eq!(reply(reader), Some(Response::done()));
        }
        server.shutdown();
    }

    #[test]
    fn a_client_that_went_away_does_not_break_finish() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        {
            let (mut stream, _reader) = connect(&server);
            stream.write_all(request(&server, &["/a"], true).as_bytes()).unwrap();
            let (id, _, _) = rx.recv_timeout(WAIT).unwrap();
            drop(stream);
            thread::sleep(Duration::from_millis(50));
            server.opened(id, None);
            server.finish(id);
        }
        server.finish(9999); // unknown ids are ignored
        server.shutdown();
    }

    #[test]
    fn request_ids_are_unique() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let mut ids = Vec::new();
        for _ in 0..3 {
            let (mut stream, _r) = connect(&server);
            stream.write_all(request(&server, &["/a"], false).as_bytes()).unwrap();
            ids.push(rx.recv_timeout(WAIT).unwrap().0);
        }
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 3);
        server.shutdown();
    }

    #[test]
    fn shutdown_drops_waiting_clients_which_they_see_as_a_closed_connection() {
        let dir = tempfile::tempdir().unwrap();
        let (server, rx) = start(dir.path());
        let (mut stream, mut reader) = connect(&server);
        stream.write_all(request(&server, &["/a"], true).as_bytes()).unwrap();
        let (id, _, _) = rx.recv_timeout(WAIT).unwrap();
        server.opened(id, None);
        assert_eq!(reply(&mut reader), Some(Response::ok()));
        server.shutdown();
        let mut rest = String::new();
        let _ = reader.read_to_string(&mut rest);
        assert!(!rest.contains("done"));
        let mut line = String::new();
        let _ = reader.read_line(&mut line);
    }

    #[test]
    fn queued_requests_wait_for_ready_and_keep_their_order() {
        let (tx, rx) = channel();
        let queue = QueuedSink::new(Arc::new(TestSink(Mutex::new(tx))));
        queue.open(1, vec!["/a".into()], false);
        queue.open(2, vec!["/b".into()], true);
        assert!(rx.try_recv().is_err(), "nothing is delivered before ready");
        queue.ready();
        assert_eq!(rx.try_recv().unwrap().0, 1);
        assert_eq!(rx.try_recv().unwrap().0, 2);
        queue.open(3, vec!["/c".into()], false);
        assert_eq!(rx.try_recv().unwrap().0, 3, "after ready requests go straight through");
    }

    #[test]
    fn early_opens_are_held_until_the_app_is_live_and_keep_their_order() {
        let early = EarlyOpens::new();
        assert_eq!(early.offer(vec!["/a".into()]), None);
        assert_eq!(early.offer(vec!["/b".into(), "/c".into()]), None);
        assert_eq!(early.go_live(), vec![vec!["/a".to_string()], vec!["/b".to_string(), "/c".to_string()]]);
    }

    #[test]
    fn once_live_early_opens_hand_the_files_straight_back() {
        let early = EarlyOpens::new();
        early.go_live();
        assert_eq!(early.offer(vec!["/a".into()]), Some(vec!["/a".to_string()]));
        assert!(early.go_live().is_empty());
    }

    #[test]
    fn going_live_with_nothing_held_is_empty() {
        assert!(EarlyOpens::new().go_live().is_empty());
    }

    #[test]
    fn ready_twice_does_not_redeliver() {
        let (tx, rx) = channel();
        let queue = QueuedSink::new(Arc::new(TestSink(Mutex::new(tx))));
        queue.open(1, vec!["/a".into()], false);
        queue.ready();
        queue.ready();
        assert_eq!(rx.try_recv().unwrap().0, 1);
        assert!(rx.try_recv().is_err());
    }
}
