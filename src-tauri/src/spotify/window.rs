// The lyrics button (S6, PLAN.md §5 M1 R3b): bring Spotify's own window forward, where its lyrics
// view is. Spotify has several top-level windows (hidden helpers, IME, a tray window); the main one
// is chosen by `pick_main_window`. A minimised window is restored, a hidden one (closed to the
// tray) is shown, then it is made the foreground window.
//
// Windows only lets the foreground process hand the foreground to another window. When the user
// clicks the button, Stanza is that process, so a plain `SetForegroundWindow` works. If it is
// refused anyway (Stanza wasn't foreground, e.g. driven by a test), the fallback briefly attaches
// this thread's input to the current foreground window's thread, the documented way to share its
// right to set the foreground.

use std::collections::HashSet;

use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EnumWindows, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongW,
    GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow,
    ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_RESTORE, SW_SHOW, WS_EX_TOOLWINDOW,
};

use super::process::process_path;
use super::{is_spotify_exe, pick_main_window, ShowWindowResult, WindowInfo};

/// Finds Spotify's main window and makes it the foreground window.
pub(super) fn show_spotify() -> ShowWindowResult {
    let windows = spotify_windows();
    let infos: Vec<WindowInfo> = windows.iter().map(|&(_, info)| info).collect();
    let Some(index) = pick_main_window(&infos) else {
        return ShowWindowResult::NotFound;
    };
    let (hwnd, info) = windows[index];
    unsafe {
        if info.minimized {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else if !info.visible {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        if SetForegroundWindow(hwnd).as_bool() && GetForegroundWindow() == hwnd {
            return ShowWindowResult::Direct;
        }
        // Refused: share the current foreground thread's input state for one call.
        let foreground_thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let this_thread = GetCurrentThreadId();
        let attached = foreground_thread != 0
            && foreground_thread != this_thread
            && AttachThreadInput(this_thread, foreground_thread, true).as_bool();
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
        if attached {
            let _ = AttachThreadInput(this_thread, foreground_thread, false);
        }
        if GetForegroundWindow() == hwnd {
            ShowWindowResult::Attached
        } else {
            ShowWindowResult::Refused
        }
    }
}

/// Every top-level window that belongs to a `Spotify.exe` process, with what `pick_main_window` needs.
fn spotify_windows() -> Vec<(HWND, WindowInfo)> {
    let mut all: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut all as *mut Vec<HWND> as isize));
    }
    let mut spotify_pids = HashSet::new();
    let mut other_pids = HashSet::new();
    all.into_iter()
        .filter_map(|hwnd| {
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
            if pid == 0 || other_pids.contains(&pid) {
                return None;
            }
            if !spotify_pids.contains(&pid) {
                if process_path(pid).is_some_and(|p| is_spotify_exe(&p)) {
                    spotify_pids.insert(pid);
                } else {
                    other_pids.insert(pid);
                    return None;
                }
            }
            Some((hwnd, window_info(hwnd)))
        })
        .collect()
}

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let all = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
    all.push(hwnd);
    BOOL(1)
}

fn window_info(hwnd: HWND) -> WindowInfo {
    let mut class = [0u16; 64];
    let len = unsafe { GetClassNameW(hwnd, &mut class) }.max(0) as usize;
    let class = String::from_utf16_lossy(&class[..len]);
    let ex_style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
    WindowInfo {
        chromium: class.starts_with("Chrome_WidgetWin"),
        visible: unsafe { IsWindowVisible(hwnd) }.as_bool(),
        minimized: unsafe { IsIconic(hwnd) }.as_bool(),
        titled: unsafe { GetWindowTextLengthW(hwnd) } > 0,
        owned: unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok_and(|owner| !owner.is_invalid()),
        tool: ex_style & WS_EX_TOOLWINDOW.0 != 0,
    }
}
