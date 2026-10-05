mod cli;
mod cli_app;
mod client;
mod cli_server;
mod files;
mod find_files;
mod install_cli;
mod macros;
mod protocol;
mod regex_compat;
mod session;
mod settings;

/// Liveness check used by the IPC client smoke test.
#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Command-line use (`next-notepad [--wait] file...`): act as a client and exit before any Tauri or window code
    // runs, so there is no window, Dock icon or focus change. No arguments means the normal application.
    let cli = cli::parse(std::env::args().skip(1));
    if cli != cli::Cli::Gui {
        std::process::exit(client::main_client(cli));
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_data_dir()?;
            app.manage(settings::SettingsState::load(dir.join("settings.json")));
            app.manage(find_files::FindJobs::default());
            app.manage(session::SessionState { dir: dir.join("session") });
            app.manage(macros::MacroState { path: dir.join("macros.json") });

            // The command-line server (ADR-0009). Requests wait in the queue until the frontend calls `cli_ready`.
            let queue = std::sync::Arc::new(cli_server::QueuedSink::new(std::sync::Arc::new(cli_app::TauriSink { app: app.handle().clone() })));
            let server = match cli_server::Server::start(dir.join("cli-server.json"), queue.clone()) {
                Ok(server) => Some(std::sync::Arc::new(server)),
                Err(e) => {
                    eprintln!("next-notepad: the command-line server could not start: {e}");
                    None
                }
            };
            app.manage(cli_app::CliState { server, queue });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            files::open_file,
            files::file_size,
            files::save_file_cmd,
            settings::get_settings,
            settings::update_settings,
            session::save_session,
            session::load_session,
            macros::load_macros,
            macros::save_macros,
            find_files::find_in_files,
            find_files::replace_in_files,
            find_files::cancel_find,
            cli_app::cli_ready,
            cli_app::open_request_opened,
            cli_app::finish_open_request,
            cli_app::finish_all_open_requests,
            install_cli::cli_info,
            install_cli::install_cli_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        use tauri::Manager;
        match event {
            tauri::RunEvent::Exit => {
                if let Some(state) = handle.try_state::<cli_app::CliState>() {
                    if let Some(server) = &state.server {
                        // A normal exit finishes every waiting command (exit 0); only a crash leaves them to see a dropped connection.
                        server.finish_all();
                        server.shutdown();
                    }
                }
            }
            // `open -a next-notepad file` and files dropped on the Dock icon open like the command without --wait.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                use cli_server::Sink;
                if let Some(state) = handle.try_state::<cli_app::CliState>() {
                    let files: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().into_owned()).collect();
                    if !files.is_empty() {
                        state.queue.open(0, files, false);
                    }
                }
            }
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_replies_pong() {
        assert_eq!(ping(), "pong");
    }
}
