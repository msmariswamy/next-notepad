//! Glue between the command-line server and the Tauri app (design D5, D7): hands requests to the frontend, brings the
//! window forward, and exposes the commands the frontend uses to answer and finish a request.

use crate::cli_server::{QueuedSink, Server, Sink};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct OpenRequest {
    id: u64,
    paths: Vec<String>,
    wait: bool,
}

/// Emits `open-request` to the frontend and shows, un-minimizes and focuses the window, for every request.
pub struct TauriSink {
    pub app: AppHandle,
}

impl Sink for TauriSink {
    fn open(&self, id: u64, files: Vec<String>, wait: bool) {
        if let Some(window) = self.app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        let _ = self.app.emit("open-request", OpenRequest { id, paths: files, wait });
    }
}

/// Managed state. `server` is `None` when the port could not be bound; the app then simply has no command-line support.
pub struct CliState {
    pub server: Option<Arc<Server>>,
    pub queue: Arc<QueuedSink>,
}

/// The frontend has registered its `open-request` listener: deliver what arrived while the window was loading.
#[tauri::command]
pub fn cli_ready(state: tauri::State<CliState>) {
    state.queue.ready();
}

/// The frontend opened the request's files (or failed with `error`).
#[tauri::command]
pub fn open_request_opened(state: tauri::State<CliState>, id: u64, error: Option<String>) {
    if let Some(server) = &state.server {
        server.opened(id, error);
    }
}

/// The user is done with a waiting request's files.
#[tauri::command]
pub fn finish_open_request(state: tauri::State<CliState>, id: u64) {
    if let Some(server) = &state.server {
        server.finish(id);
    }
}

/// The app is quitting normally: every waiting command is done.
#[tauri::command]
pub fn finish_all_open_requests(state: tauri::State<CliState>) {
    if let Some(server) = &state.server {
        server.finish_all();
    }
}
