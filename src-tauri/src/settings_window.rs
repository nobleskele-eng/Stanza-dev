// The settings window (M3 L4, design A "Index", DECISIONS.md 2026-11-08): a second, ordinary window with Windows' own
// title bar, dark, opened from the gear picture in the player's right-click menu. One at a time: opening it again
// brings the open one forward. Its page is the same bundle, which renders the settings UI for this window's label
// (src/App.tsx). The player window owns the appearance; the two talk through events (src/settings/bridge.ts).

use tauri::{webview::Color, AppHandle, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

/// The window's label (`SETTINGS_LABEL` in src/settings/bridge.ts).
pub const LABEL: &str = "settings";
/// Logical px. Resizable down to MIN; the section grid reflows.
const SIZE: (f64, f64) = (900.0, 640.0);
const MIN: (f64, f64) = (640.0, 480.0);
/// The settings page's background (T1's ink, `--st-bg` in src/settings/settings.css), so the window never flashes white
/// before the page paints.
const INK: Color = Color(11, 11, 13, 255);
const MAX_TITLE_CHARS: usize = 80;

/// The title as given (it comes from docs/COPY.md through the frontend), without control characters, bounded.
fn clean_title(title: &str) -> String {
    title.chars().filter(|c| !c.is_control()).take(MAX_TITLE_CHARS).collect()
}

/// Opens the settings window, or brings the open one forward. Async: building a webview window inside a synchronous
/// command deadlocks on Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle, title: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        return window.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
        .title(clean_title(&title))
        .inner_size(SIZE.0, SIZE.1)
        .min_inner_size(MIN.0, MIN.1)
        .resizable(true)
        .decorations(true)
        .theme(Some(Theme::Dark))
        .background_color(INK)
        .center()
        .focused(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_lose_control_characters_and_are_bounded() {
        assert_eq!(clean_title("[NEEDS COPY]"), "[NEEDS COPY]");
        assert_eq!(clean_title("a\u{0007}b\nc\u{009b}"), "abc");
        assert_eq!(clean_title(&"é".repeat(100)).chars().count(), MAX_TITLE_CHARS);
    }

    #[test]
    fn the_label_is_the_one_the_frontend_checks() {
        let bridge = include_str!("../../src/settings/bridge.ts");
        assert!(bridge.contains(&format!("export const SETTINGS_LABEL = \"{LABEL}\";")), "src/settings/bridge.ts");
    }
}
