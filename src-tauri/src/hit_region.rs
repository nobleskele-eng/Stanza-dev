// Click-through for the transparent part of the window (docs/DECISIONS.md, Slice 3).
//
// The native window is sized for the theme's largest state (THEME_CONTRACT.md `window`), so most
// of it is usually transparent, but a window takes clicks over its whole rectangle. The frontend
// reports the player's box; this thread polls the cursor and makes the window ignore the mouse
// (on Windows tao sets WS_EX_TRANSPARENT | WS_EX_LAYERED) only while the cursor is outside that
// box. Until a usable box is reported the window never ignores the mouse, so a frontend failure
// degrades to the old behaviour instead of an unclickable window.

use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

/// How often the cursor is checked. Entering the player turns clicks back on within one period.
const POLL: Duration = Duration::from_millis(30);

/// Logical px, relative to the window's client area (what `getBoundingClientRect` gives).
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }

    fn has_area(&self) -> bool {
        self.width > 0.0 && self.height > 0.0
    }
}

/// The player's hit area; `None` until the frontend reports one.
#[derive(Default)]
pub struct HitRegion(Mutex<Option<Vec<Rect>>>);

#[tauri::command]
pub fn set_hit_region(rects: Vec<Rect>, region: tauri::State<'_, HitRegion>) {
    if let Ok(mut current) = region.0.lock() {
        *current = Some(rects);
    }
}

/// One reading of where the cursor is relative to the window.
#[derive(Clone, Copy, Debug)]
pub struct Sample {
    /// Physical screen px.
    pub cursor: (f64, f64),
    /// The client area's top-left, physical screen px.
    pub origin: (f64, f64),
    /// Physical px per logical px (the region is logical).
    pub scale: f64,
}

/// Whether the window should let clicks through: only when the region has at least one rect with
/// area and the cursor is outside all of them.
pub fn should_ignore(region: Option<&[Rect]>, s: Sample) -> bool {
    let rects: Vec<&Rect> = region
        .unwrap_or_default()
        .iter()
        .filter(|r| r.has_area())
        .collect();
    if rects.is_empty() || s.scale.is_nan() || s.scale <= 0.0 {
        return false;
    }
    let x = (s.cursor.0 - s.origin.0) / s.scale;
    let y = (s.cursor.1 - s.origin.1) / s.scale;
    !rects.iter().any(|r| r.contains(x, y))
}

pub fn spawn_poller<R: Runtime>(app: AppHandle<R>, label: &'static str) {
    std::thread::spawn(move || {
        let mut ignoring = false;
        let mut sampler = None;
        loop {
            std::thread::sleep(POLL);
            let Some(window) = app.get_webview_window(label) else {
                continue;
            };
            let sampler = sampler.get_or_insert_with(|| Sampler::new(&window));
            let region = app
                .state::<HitRegion>()
                .0
                .lock()
                .ok()
                .and_then(|r| r.clone());
            let want = sampler
                .sample(&window)
                .is_some_and(|s| should_ignore(region.as_deref(), s));
            if want != ignoring && window.set_ignore_cursor_events(want).is_ok() {
                ignoring = want;
            }
        }
    });
}

/// Reads a `Sample` every tick. On Windows that is three plain syscalls on the polling thread.
/// Tauri's getters would each be a round trip through the main event loop, measured at ~95 ms
/// CPU per 10 s idle against ~0 without polling (docs/DECISIONS.md, Slice 3).
struct Sampler {
    #[cfg(windows)]
    hwnd: Option<isize>,
}

impl Sampler {
    fn new<R: Runtime>(_window: &WebviewWindow<R>) -> Self {
        Self {
            // One event-loop round trip, once. Without a handle the window never ignores clicks.
            #[cfg(windows)]
            hwnd: _window.hwnd().ok().map(|h| h.0 as isize),
        }
    }

    #[cfg(windows)]
    fn sample<R: Runtime>(&self, _window: &WebviewWindow<R>) -> Option<Sample> {
        use windows::Win32::Foundation::{HWND, POINT};
        use windows::Win32::Graphics::Gdi::ClientToScreen;
        use windows::Win32::UI::HiDpi::GetDpiForWindow;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

        let hwnd = HWND(self.hwnd? as _);
        let (mut cursor, mut origin) = (POINT::default(), POINT::default());
        // SAFETY: read-only Win32 queries on our own window handle; a stale handle makes them fail.
        unsafe {
            GetCursorPos(&mut cursor).ok()?;
            if !ClientToScreen(hwnd, &mut origin).as_bool() {
                return None;
            }
            let dpi = GetDpiForWindow(hwnd);
            (dpi > 0).then(|| Sample {
                cursor: (cursor.x.into(), cursor.y.into()),
                origin: (origin.x.into(), origin.y.into()),
                scale: f64::from(dpi) / 96.0,
            })
        }
    }

    /// macOS: untested (no Mac available, CLAUDE.md).
    #[cfg(not(windows))]
    fn sample<R: Runtime>(&self, window: &WebviewWindow<R>) -> Option<Sample> {
        let c = window.cursor_position().ok()?;
        let o = window.inner_position().ok()?;
        let scale = window.scale_factor().ok()?;
        Some(Sample {
            cursor: (c.x, c.y),
            origin: (o.x.into(), o.y.into()),
            scale,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // T1's idle card, roughly: 280x245 at the window's top-left.
    const CARD: Rect = Rect {
        x: 0.0,
        y: 0.0,
        width: 280.0,
        height: 245.0,
    };

    fn at(cursor: (f64, f64), origin: (f64, f64), scale: f64) -> Sample {
        Sample {
            cursor,
            origin,
            scale,
        }
    }

    #[test]
    fn never_ignores_without_a_usable_region() {
        let far = at((5000.0, 5000.0), (0.0, 0.0), 1.0);
        assert!(!should_ignore(None, far));
        assert!(!should_ignore(Some(&[]), far));
        assert!(!should_ignore(Some(&[Rect { width: 0.0, ..CARD }]), far));
        assert!(!should_ignore(
            Some(&[CARD]),
            at((5000.0, 5000.0), (0.0, 0.0), 0.0)
        ));
        assert!(!should_ignore(
            Some(&[CARD]),
            at((5000.0, 5000.0), (0.0, 0.0), f64::NAN)
        ));
    }

    #[test]
    fn takes_clicks_over_the_player_and_lets_them_through_elsewhere() {
        let o = (100.0, 200.0);
        assert!(
            !should_ignore(Some(&[CARD]), at((100.0, 200.0), o, 1.0)),
            "top-left corner is inside"
        );
        assert!(
            !should_ignore(Some(&[CARD]), at((379.0, 444.0), o, 1.0)),
            "last pixel is inside"
        );
        assert!(
            should_ignore(Some(&[CARD]), at((380.0, 300.0), o, 1.0)),
            "right of the card"
        );
        assert!(
            should_ignore(Some(&[CARD]), at((200.0, 700.0), o, 1.0)),
            "below the card, inside the window"
        );
        assert!(
            should_ignore(Some(&[CARD]), at((99.0, 250.0), o, 1.0)),
            "left of the window entirely"
        );
    }

    #[test]
    fn converts_physical_cursor_to_logical_at_display_scaling() {
        // 150%: the card's right edge (280 logical) is 420 physical px from the client origin.
        let o = (-1920.0, 0.0); // a monitor left of the primary one
        assert!(!should_ignore(
            Some(&[CARD]),
            at((-1920.0 + 419.0, 10.0), o, 1.5)
        ));
        assert!(should_ignore(
            Some(&[CARD]),
            at((-1920.0 + 421.0, 10.0), o, 1.5)
        ));
        assert!(!should_ignore(
            Some(&[CARD]),
            at((-1920.0 + 349.0, 305.0), o, 1.25)
        ));
        assert!(should_ignore(
            Some(&[CARD]),
            at((-1920.0 + 349.0, 307.0), o, 1.25)
        ));
    }

    #[test]
    fn any_rect_counts() {
        let badge = Rect {
            x: 300.0,
            y: 0.0,
            width: 20.0,
            height: 20.0,
        };
        assert!(!should_ignore(
            Some(&[CARD, badge]),
            at((310.0, 10.0), (0.0, 0.0), 1.0)
        ));
        assert!(should_ignore(
            Some(&[CARD, badge]),
            at((310.0, 30.0), (0.0, 0.0), 1.0)
        ));
    }
}
