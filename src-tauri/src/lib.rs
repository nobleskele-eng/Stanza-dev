mod hit_region;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Position only: size comes from the active theme's theme.json `window` (set from the
        // frontend), and frame/visibility from tauri.conf.json. Restoring all flags would bring
        // back a stale saved size and `decorated: true` from before the frameless window.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .manage(hit_region::HitRegion::default())
        .setup(|app| {
            hit_region::spawn_poller(app.handle().clone(), "main");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, hit_region::set_hit_region])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
