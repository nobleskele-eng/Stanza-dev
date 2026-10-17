// Which program a process is (Windows). Shared by the volume and window lookups, which both find
// Spotify by its process image (`is_spotify_exe`), never by a hardcoded id.

use windows::core::PWSTR;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// The full image path of process `pid`, if it can be read.
pub(super) fn process_path(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
    }
    .is_ok();
    unsafe {
        let _ = CloseHandle(handle);
    }
    ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
}
