mod files;
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            files::open_file,
            files::save_file_cmd,
            settings::get_settings,
            settings::update_settings
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
