mod gsmtc;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = Arc::new(gsmtc::GsmtcState::default());
            app.manage(state.clone());
            gsmtc::init(app.handle().clone(), state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gsmtc::gsmtc_snapshot,
            gsmtc::gsmtc_play_pause,
            gsmtc::gsmtc_next,
            gsmtc::gsmtc_previous,
            gsmtc::gsmtc_seek,
            gsmtc::gsmtc_toggle_shuffle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
