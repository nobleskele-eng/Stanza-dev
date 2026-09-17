// S2 spike: read Spotify's now-playing session on Windows via GSMTC.
// Filters sessions to whichever one's SourceAppUserModelId contains
// "spotify" (case-insensitive) -- per D5, the exact AUMID is logged
// (not hardcoded) since it differs between the spotify.com installer
// and the Microsoft Store build.

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{Buffer, IRandomAccessStreamReference, InputStreamOptions};

#[derive(Clone, Serialize, Default)]
pub struct Caps {
    pub play_pause: bool,
    pub next: bool,
    pub previous: bool,
    pub seek: bool,
    pub shuffle: Option<bool>,
    pub repeat: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct NowPlayingSnapshot {
    pub found: bool,
    pub aumid: String,
    pub status: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumbnail: Option<String>,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub updated_at_ms: i64,
    pub caps: Caps,
}

pub struct GsmtcState {
    pub latest: Mutex<NowPlayingSnapshot>,
    pub session: Mutex<Option<Session>>,
}

impl Default for GsmtcState {
    fn default() -> Self {
        Self {
            latest: Mutex::new(NowPlayingSnapshot::default()),
            session: Mutex::new(None),
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn read_thumbnail(ref_: &IRandomAccessStreamReference) -> Option<String> {
    let stream = ref_.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 {
        return None;
    }
    let buffer = Buffer::Create(size).ok()?;
    let op = stream
        .ReadAsync(&buffer, size, InputStreamOptions::ReadAhead)
        .ok()?;
    let filled = op.get().ok()?;
    let len = filled.Length().ok()? as usize;
    let reader = windows::Storage::Streams::DataReader::FromBuffer(&filled).ok()?;
    let mut bytes = vec![0u8; len];
    reader.ReadBytes(&mut bytes).ok()?;

    let mime = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else {
        "application/octet-stream"
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

fn build_snapshot(session: &Session) -> NowPlayingSnapshot {
    let aumid = session
        .SourceAppUserModelId()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default();

    let mut snap = NowPlayingSnapshot {
        found: true,
        aumid,
        ..Default::default()
    };

    if let Ok(props) = session.TryGetMediaPropertiesAsync().and_then(|op| op.get()) {
        snap.title = props.Title().map(|s| s.to_string_lossy()).unwrap_or_default();
        snap.artist = props
            .Artist()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();
        snap.album = props
            .AlbumTitle()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();
        if let Ok(thumb) = props.Thumbnail() {
            snap.thumbnail = read_thumbnail(&thumb);
        }
    }

    if let Ok(playback) = session.GetPlaybackInfo() {
        snap.status = playback
            .PlaybackStatus()
            .map(|s| {
                match s {
                    PlaybackStatus::Playing => "playing",
                    PlaybackStatus::Paused => "paused",
                    PlaybackStatus::Stopped => "idle",
                    PlaybackStatus::Changing => "idle",
                    PlaybackStatus::Closed => "idle",
                    _ => "idle",
                }
                .to_string()
            })
            .unwrap_or_else(|_| "idle".to_string());

        if let Ok(controls) = playback.Controls() {
            snap.caps.play_pause = controls.IsPlayEnabled().unwrap_or(false)
                || controls.IsPauseEnabled().unwrap_or(false);
            snap.caps.next = controls.IsNextEnabled().unwrap_or(false);
            snap.caps.previous = controls.IsPreviousEnabled().unwrap_or(false);
            snap.caps.seek = controls.IsPlaybackPositionEnabled().unwrap_or(false);
        }

        snap.caps.shuffle = playback.IsShuffleActive().ok().and_then(|r| r.Value().ok());
        snap.caps.repeat = playback
            .AutoRepeatMode()
            .ok()
            .and_then(|r| r.Value().ok())
            .map(|m| format!("{m:?}"));
    }

    if let Ok(timeline) = session.GetTimelineProperties() {
        let pos = timeline.Position().map(|d| d.Duration / 10_000).unwrap_or(0);
        let end = timeline
            .EndTime()
            .map(|d| d.Duration / 10_000)
            .unwrap_or(0);
        snap.position_ms = pos;
        snap.duration_ms = end;
    }
    snap.updated_at_ms = now_ms();

    snap
}

fn find_spotify_session(mgr: &SessionManager) -> Option<Session> {
    let sessions = mgr.GetSessions().ok()?;
    for i in 0..sessions.Size().ok()? {
        if let Ok(session) = sessions.GetAt(i) {
            if let Ok(aumid) = session.SourceAppUserModelId() {
                let aumid = aumid.to_string_lossy();
                eprintln!("[gsmtc] session seen: {aumid}");
                if aumid.to_lowercase().contains("spotify") {
                    return Some(session);
                }
            }
        }
    }
    None
}

fn emit_snapshot(app: &AppHandle, state: &Arc<GsmtcState>, session: &Session) {
    let snap = build_snapshot(session);
    *state.latest.lock().unwrap() = snap.clone();
    let _ = app.emit("gsmtc:now-playing", snap);
}

fn attach_session_handlers(app: AppHandle, state: Arc<GsmtcState>, session: Session) {
    emit_snapshot(&app, &state, &session);

    {
        let app = app.clone();
        let state = state.clone();
        let session_for_cb = session.clone();
        let _ = session.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
            emit_snapshot(&app, &state, &session_for_cb);
            Ok(())
        }));
    }
    {
        let app = app.clone();
        let state = state.clone();
        let session_for_cb = session.clone();
        let _ = session.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
            emit_snapshot(&app, &state, &session_for_cb);
            Ok(())
        }));
    }
    {
        let app = app.clone();
        let state = state.clone();
        let session_for_cb = session.clone();
        let _ = session.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
            emit_snapshot(&app, &state, &session_for_cb);
            Ok(())
        }));
    }

    *state.session.lock().unwrap() = Some(session);
}

pub fn init(app: AppHandle, state: Arc<GsmtcState>) {
    std::thread::spawn(move || {
        unsafe {
            let _ = windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            );
        }

        let mgr = match SessionManager::RequestAsync().and_then(|op| op.get()) {
            Ok(mgr) => mgr,
            Err(e) => {
                eprintln!("[gsmtc] failed to get session manager: {e:?}");
                return;
            }
        };

        if let Some(session) = find_spotify_session(&mgr) {
            attach_session_handlers(app.clone(), state.clone(), session);
        }

        let app2 = app.clone();
        let state2 = state.clone();
        let mgr2 = mgr.clone();
        let _ = mgr.SessionsChanged(&TypedEventHandler::new(move |_, _| {
            if let Some(session) = find_spotify_session(&mgr2) {
                attach_session_handlers(app2.clone(), state2.clone(), session);
            }
            Ok(())
        }));

        // Keep this thread (and the WinRT event registrations) alive.
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3600));
        }
    });
}

#[tauri::command]
pub fn gsmtc_snapshot(state: tauri::State<Arc<GsmtcState>>) -> NowPlayingSnapshot {
    state.latest.lock().unwrap().clone()
}

#[tauri::command]
pub fn gsmtc_play_pause(state: tauri::State<Arc<GsmtcState>>) -> bool {
    let guard = state.session.lock().unwrap();
    guard
        .as_ref()
        .and_then(|s| s.TryTogglePlayPauseAsync().ok())
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn gsmtc_next(state: tauri::State<Arc<GsmtcState>>) -> bool {
    let guard = state.session.lock().unwrap();
    guard
        .as_ref()
        .and_then(|s| s.TrySkipNextAsync().ok())
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn gsmtc_previous(state: tauri::State<Arc<GsmtcState>>) -> bool {
    let guard = state.session.lock().unwrap();
    guard
        .as_ref()
        .and_then(|s| s.TrySkipPreviousAsync().ok())
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn gsmtc_seek(state: tauri::State<Arc<GsmtcState>>, position_ms: i64) -> bool {
    let guard = state.session.lock().unwrap();
    guard
        .as_ref()
        .and_then(|s| {
            s.TryChangePlaybackPositionAsync(position_ms * 10_000)
                .ok()
        })
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn gsmtc_toggle_shuffle(state: tauri::State<Arc<GsmtcState>>) -> bool {
    let guard = state.session.lock().unwrap();
    let Some(session) = guard.as_ref() else {
        return false;
    };
    let current = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|p| p.IsShuffleActive().ok())
        .and_then(|r| r.Value().ok())
        .unwrap_or(false);
    session
        .TryChangeShuffleActiveAsync(!current)
        .ok()
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}
