mod files;
mod find_files;
mod macros;
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_data_dir()?;
            app.manage(settings::SettingsState::load(dir.join("settings.json")));
            app.manage(find_files::FindJobs::default());
            app.manage(session::SessionState { dir: dir.join("session") });
            app.manage(macros::MacroState { path: dir.join("macros.json") });
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
            find_files::cancel_find
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_replies_pong() {
        assert_eq!(ping(), "pong");
    }
}
