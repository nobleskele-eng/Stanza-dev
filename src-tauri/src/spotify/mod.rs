// Spotify now-playing and transport (PLAN.md §5 M1 / R1). On Windows this reads Spotify's GSMTC
// session (D5; the S2 spike, docs/DECISIONS.md 2026-09-16) on one worker thread (`gsmtc.rs`) that
// owns every WinRT object. Windows' change events and the frontend's commands both reach it as
// messages, so nothing WinRT ever runs on the main thread.
//
// The frontend pulls the full state once (`spotify_state`) and then follows `spotify:state`
// events. Artwork is a 300x300 PNG of ~240 kB (~320 kB as base64), so an event carries it only
// when it changed since the previous event; a pull always carries it. `seq` orders pulls against
// events.
//
// Volume (S5, M1 R3) is separate: GSMTC has none, so `volume.rs` sets Spotify's per-app level
// through Core Audio on its own thread and publishes `spotify:volume`.
//
// macOS (AppleScript, D4) is M5: on other platforms nothing is started, the state stays "no
// session" and every command answers false. **Untested off Windows.**

#[cfg(windows)]
mod gsmtc;
#[cfg(windows)]
mod volume;

use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, State};

/// The events the frontend listens to (`src/adapters/spotifyAdapter.ts`).
pub const STATE_EVENT: &str = "spotify:state";
pub const VOLUME_EVENT: &str = "spotify:volume";

/// How long a transport command waits for the worker before answering false.
const CONTROL_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Playing,
    Paused,
    #[default]
    Idle,
}

/// What the frontend receives. Mirrors `SpotifyState` in `src/adapters/spotifyFeed.ts`.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyState {
    /// Increases with every published change; lets the frontend drop an older pull.
    pub seq: u64,
    /// Whether a Spotify GSMTC session exists (Spotify running and registered with Windows).
    pub session: bool,
    pub status: Status,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// 0 = no artwork. Any other value names one artwork image; a new image gets a new id.
    pub artwork_id: u32,
    /// `data:` URL of artwork `artwork_id`. Present in a pull, and in an event whose id changed.
    pub artwork: Option<String>,
    pub position_ms: i64,
    pub duration_ms: i64,
    /// Unix ms at which `position_ms` was current (GSMTC `LastUpdatedTime`, C10).
    pub position_updated_at: i64,
    pub can_seek: bool,
}

/// Spotify's own (per-app) volume. Mirrors `SpotifyVolume` in `src/adapters/spotifyFeed.ts`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyVolume {
    /// Spotify has an audio session to set (it has played since it started, on an active device).
    pub available: bool,
    /// 0–1, rounded to 3 decimals.
    pub level: f32,
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) enum VolumeMsg {
    Set(f32, Sender<bool>),
}

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug)]
pub(crate) enum Control {
    PlayPause,
    Next,
    Previous,
    Seek(i64),
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) enum Msg {
    SessionsChanged,
    MediaChanged,
    PlaybackChanged,
    TimelineChanged,
    Control(Control, Sender<bool>),
}

/// Managed state: the last published state (with artwork) and the way to the worker.
#[derive(Default)]
pub struct Spotify {
    latest: Mutex<SpotifyState>,
    worker: Mutex<Option<Sender<Msg>>>,
    volume: Mutex<SpotifyVolume>,
    volume_worker: Mutex<Option<Sender<VolumeMsg>>>,
}

impl Spotify {
    #[cfg_attr(not(windows), allow(dead_code))]
    pub(crate) fn store(&self, state: &SpotifyState) {
        if let Ok(mut latest) = self.latest.lock() {
            *latest = state.clone();
        }
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    pub(crate) fn store_volume(&self, volume: SpotifyVolume) {
        if let Ok(mut current) = self.volume.lock() {
            *current = volume;
        }
    }

    async fn set_volume(&self, level: f32) -> bool {
        let Some(worker) = self.volume_worker.lock().ok().and_then(|w| w.clone()) else {
            return false;
        };
        let (reply, answer) = mpsc::channel();
        if worker.send(VolumeMsg::Set(level, reply)).is_err() {
            return false;
        }
        tauri::async_runtime::spawn_blocking(move || {
            answer.recv_timeout(CONTROL_TIMEOUT).unwrap_or(false)
        })
        .await
        .unwrap_or(false)
    }

    async fn control(&self, control: Control) -> bool {
        let Some(worker) = self.worker.lock().ok().and_then(|w| w.clone()) else {
            return false;
        };
        let (reply, answer) = mpsc::channel();
        if worker.send(Msg::Control(control, reply)).is_err() {
            return false;
        }
        tauri::async_runtime::spawn_blocking(move || {
            answer.recv_timeout(CONTROL_TIMEOUT).unwrap_or(false)
        })
        .await
        .unwrap_or(false)
    }
}

/// Starts the worker (Windows only). Call once from `setup`, after `Spotify` is managed.
pub fn start(app: &AppHandle) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let (tx, rx) = mpsc::channel();
        if let Ok(mut worker) = app.state::<Spotify>().worker.lock() {
            *worker = Some(tx.clone());
        }
        gsmtc::spawn(app.clone(), tx, rx);
        let (tx, rx) = mpsc::channel();
        if let Ok(mut worker) = app.state::<Spotify>().volume_worker.lock() {
            *worker = Some(tx);
        }
        volume::spawn(app.clone(), rx);
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[tauri::command]
pub fn spotify_state(spotify: State<'_, Spotify>) -> SpotifyState {
    spotify.latest.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
pub async fn spotify_play_pause(spotify: State<'_, Spotify>) -> Result<bool, String> {
    Ok(spotify.control(Control::PlayPause).await)
}

#[tauri::command]
pub async fn spotify_next(spotify: State<'_, Spotify>) -> Result<bool, String> {
    Ok(spotify.control(Control::Next).await)
}

#[tauri::command]
pub async fn spotify_previous(spotify: State<'_, Spotify>) -> Result<bool, String> {
    Ok(spotify.control(Control::Previous).await)
}

#[tauri::command]
pub async fn spotify_seek(position_ms: i64, spotify: State<'_, Spotify>) -> Result<bool, String> {
    Ok(spotify.control(Control::Seek(position_ms.max(0))).await)
}

#[tauri::command]
pub fn spotify_volume(spotify: State<'_, Spotify>) -> SpotifyVolume {
    spotify.volume.lock().map(|v| *v).unwrap_or_default()
}

#[tauri::command]
pub async fn spotify_set_volume(level: f32, spotify: State<'_, Spotify>) -> Result<bool, String> {
    if !level.is_finite() {
        return Ok(false);
    }
    Ok(spotify.set_volume(level.clamp(0.0, 1.0)).await)
}

// --- Pure helpers (the WinRT glue in gsmtc.rs stays thin; these carry the logic and are unit-tested).

/// Spotify's audio sessions are found by process image name (installer and Store builds both run
/// `Spotify.exe`), compared on the file name only.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn is_spotify_exe(path: &str) -> bool {
    path.rsplit(['\\', '/'])
        .next()
        .is_some_and(|file| file.eq_ignore_ascii_case("spotify.exe"))
}

/// A volume level clamped to 0–1 and rounded to 3 decimals, so float noise never counts as a change.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn round_level(level: f32) -> f32 {
    (level.clamp(0.0, 1.0) * 1000.0).round() / 1000.0
}

/// D5: never hardcode the AUMID (installer build: `Spotify.exe`; the Store build differs).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn is_spotify(aumid: &str) -> bool {
    aumid.to_lowercase().contains("spotify")
}

/// GSMTC's playback status, mirrored so the mapping is testable without WinRT.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RawStatus {
    Closed,
    Opened,
    Changing,
    Stopped,
    Playing,
    Paused,
}

/// `Changing` is the moment between two tracks: keep what was showing instead of flashing idle.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn map_status(raw: RawStatus, previous: Status) -> Status {
    match raw {
        RawStatus::Playing => Status::Playing,
        RawStatus::Paused => Status::Paused,
        RawStatus::Changing => previous,
        RawStatus::Closed | RawStatus::Opened | RawStatus::Stopped => Status::Idle,
    }
}

/// WinRT `TimeSpan` (100 ns units) → ms.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn ticks_to_ms(ticks: i64) -> i64 {
    ticks / 10_000
}

/// 100 ns intervals between 1601-01-01 (WinRT `DateTime`) and 1970-01-01 (Unix).
const UNIX_EPOCH_TICKS: i64 = 116_444_736_000_000_000;

/// When the position was current, as Unix ms. GSMTC's `LastUpdatedTime` is a WinRT `DateTime`;
/// a zero (never set) or future value can't be interpolated from, so it falls back to `now_ms`.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn position_updated_at(universal_ticks: i64, now_ms: i64) -> i64 {
    if universal_ticks <= UNIX_EPOCH_TICKS {
        return now_ms;
    }
    let ms = (universal_ticks - UNIX_EPOCH_TICKS) / 10_000;
    if ms > now_ms + 1_000 {
        now_ms
    } else {
        ms
    }
}

/// How long a new track's timeline waits for its title and artwork (see `awaits_media`).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) const MEDIA_WAIT: Duration = Duration::from_millis(400);

/// Spotify reports a new track's timeline (new position, new duration) ~200 ms before its title
/// and artwork (measured in the real exe, DECISIONS.md M1 R2). Published alone it would show the
/// old title at the new track's position, so a burst whose duration changed without a media change
/// waits up to `MEDIA_WAIT` for the media. A seek or pause keeps the duration and is never held;
/// nor is the first read (nothing published yet).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn awaits_media(
    media_changed: bool,
    published_duration_ms: i64,
    duration_ms: i64,
) -> bool {
    !media_changed && published_duration_ms != 0 && duration_ms != published_duration_ms
}

/// How much older than "now" a resume's timeline may be before it is treated as stale.
const RESUME_SLACK_MS: i64 = 1_000;

/// C10 on resume. A paused position stays current for as long as the pause lasts. If Spotify
/// resumes without refreshing its timeline, `LastUpdatedTime` still dates from the pause, and
/// interpolating from it would jump ahead by the whole pause. So on paused → playing with an older
/// timestamp, the position counts as current from now. Only from *paused*: on the first read a
/// playing session's timestamp is genuine, however old. (Whether Spotify needs this: R2.)
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn resume_anchor(previous: Status, next: Status, updated_at: i64, now_ms: i64) -> i64 {
    if previous == Status::Paused
        && next == Status::Playing
        && updated_at < now_ms - RESUME_SLACK_MS
    {
        now_ms
    } else {
        updated_at
    }
}

/// Artwork as a `data:` URL, or None for an empty or unrecognised image (an `<img>` couldn't show it).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn artwork_data_url(bytes: &[u8]) -> Option<String> {
    let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        return None;
    };
    use base64::Engine;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spotify_sessions_are_found_by_name_in_any_case() {
        assert!(is_spotify("Spotify.exe"));
        assert!(is_spotify("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"));
        assert!(!is_spotify("Chrome"));
        assert!(!is_spotify(""));
    }

    #[test]
    fn spotify_audio_sessions_are_matched_by_exe_file_name() {
        assert!(is_spotify_exe(
            r"C:\Users\u\AppData\Roaming\Spotify\Spotify.exe"
        ));
        assert!(is_spotify_exe(
            r"C:\Program Files\WindowsApps\SpotifyAB.SpotifyMusic_1.0_x64\Spotify.exe"
        ));
        assert!(is_spotify_exe("spotify.EXE"));
        assert!(!is_spotify_exe(r"C:\Spotify\SpotifyWebHelper.exe"));
        assert!(!is_spotify_exe(
            r"C:\Program Files\Google\Chrome\chrome.exe"
        ));
        assert!(!is_spotify_exe(""));
    }

    #[test]
    fn volume_levels_are_clamped_and_rounded() {
        assert_eq!(round_level(0.54 + 1e-7), 0.54); // f32 noise from the mixer
        assert_eq!(round_level(0.123_456), 0.123);
        assert_eq!(round_level(1.7), 1.0);
        assert_eq!(round_level(-0.2), 0.0);
        let json = serde_json::to_value(SpotifyVolume {
            available: true,
            level: 0.5,
        })
        .unwrap();
        assert_eq!(json, serde_json::json!({ "available": true, "level": 0.5 }));
    }

    #[test]
    fn changing_keeps_the_previous_status_and_the_rest_map_directly() {
        assert_eq!(
            map_status(RawStatus::Changing, Status::Playing),
            Status::Playing
        );
        assert_eq!(
            map_status(RawStatus::Changing, Status::Paused),
            Status::Paused
        );
        assert_eq!(
            map_status(RawStatus::Playing, Status::Idle),
            Status::Playing
        );
        assert_eq!(
            map_status(RawStatus::Paused, Status::Playing),
            Status::Paused
        );
        for raw in [RawStatus::Closed, RawStatus::Opened, RawStatus::Stopped] {
            assert_eq!(map_status(raw, Status::Playing), Status::Idle, "{raw:?}");
        }
    }

    #[test]
    fn timespans_become_milliseconds() {
        assert_eq!(ticks_to_ms(0), 0);
        assert_eq!(ticks_to_ms(2_105_000_000), 210_500); // 3:30.5
    }

    #[test]
    fn last_updated_time_becomes_unix_ms_unless_unset_or_in_the_future() {
        let now = 1_760_000_000_000; // 2025-10-09
        let ticks = |unix_ms: i64| UNIX_EPOCH_TICKS + unix_ms * 10_000;
        assert_eq!(position_updated_at(ticks(now - 2_500), now), now - 2_500);
        assert_eq!(
            position_updated_at(ticks(now + 500), now),
            now + 500,
            "small clock skew is kept"
        );
        assert_eq!(
            position_updated_at(ticks(now + 60_000), now),
            now,
            "the future falls back to now"
        );
        assert_eq!(position_updated_at(0, now), now, "never set");
        assert_eq!(position_updated_at(UNIX_EPOCH_TICKS, now), now);
    }

    #[test]
    fn a_new_tracks_timeline_waits_for_its_media_and_nothing_else_does() {
        assert!(
            awaits_media(false, 125_901, 216_280),
            "new duration, no title yet: wait"
        );
        assert!(
            !awaits_media(true, 125_901, 216_280),
            "title came in the same burst"
        );
        assert!(
            !awaits_media(false, 125_901, 125_901),
            "seek or pause: same duration"
        );
        assert!(
            !awaits_media(false, 0, 216_280),
            "first read: nothing published yet"
        );
    }

    #[test]
    fn a_resume_with_a_stale_timeline_counts_from_now_and_nothing_else_does() {
        let now = 1_760_000_000_000;
        let paused_at = now - 60_000;
        assert_eq!(
            resume_anchor(Status::Paused, Status::Playing, paused_at, now),
            now,
            "stale: from now"
        );
        assert_eq!(
            resume_anchor(Status::Paused, Status::Playing, now - 200, now),
            now - 200,
            "fresh: kept"
        );
        assert_eq!(
            resume_anchor(Status::Idle, Status::Playing, paused_at, now),
            paused_at,
            "first read: genuine"
        );
        assert_eq!(
            resume_anchor(Status::Playing, Status::Playing, paused_at, now),
            paused_at
        );
        assert_eq!(
            resume_anchor(Status::Playing, Status::Paused, paused_at, now),
            paused_at
        );
    }

    #[test]
    fn artwork_becomes_a_data_url_only_for_images_an_img_can_show() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(
            artwork_data_url(&png).unwrap(),
            "data:image/png;base64,iVBORw0KGgo="
        );
        assert!(artwork_data_url(&[0xFF, 0xD8, 0xFF, 0xE0])
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
        assert!(artwork_data_url(b"RIFF\0\0\0\0WEBPVP8 ")
            .unwrap()
            .starts_with("data:image/webp;base64,"));
        assert_eq!(artwork_data_url(&[]), None);
        assert_eq!(artwork_data_url(b"GIF89a"), None);
        assert_eq!(artwork_data_url(b"<svg"), None);
    }

    #[test]
    fn the_wire_format_is_camel_case_with_lowercase_status() {
        let json = serde_json::to_value(SpotifyState {
            artwork_id: 3,
            position_updated_at: 7,
            ..Default::default()
        })
        .unwrap();
        assert_eq!(json["status"], "idle");
        assert_eq!(json["artworkId"], 3);
        assert_eq!(json["positionUpdatedAt"], 7);
        assert_eq!(json["artwork"], serde_json::Value::Null);
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        let mut expected = [
            "seq",
            "session",
            "status",
            "title",
            "artist",
            "album",
            "artworkId",
            "artwork",
            "positionMs",
            "durationMs",
            "positionUpdatedAt",
            "canSeek",
        ];
        keys.sort();
        expected.sort();
        assert_eq!(keys, expected);
    }
}
