// Spotify's own volume (S5, PLAN.md §5 M1 R3). GSMTC has no volume (PLAN.md §3), so this goes
// through Core Audio instead: the per-app level Windows' volume mixer shows for Spotify, leaving the
// master volume alone. One thread owns the COM objects. It finds Spotify's audio sessions on every
// active output device (by process image name, never a hardcoded id), sets them all on request, and
// checks the level once a second so a change made in the mixer shows up in Stanza. The session list
// is cached and rescanned every few seconds (Spotify creates its session when it first plays).

use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use windows::core::Interface;
use windows::Win32::Media::Audio::{
    eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume,
    MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};

use super::process::process_path;
use super::{is_spotify_exe, round_level, Spotify, SpotifyVolume, VolumeMsg, VOLUME_EVENT};

/// How often the level is read back (a change made in the mixer appears within this).
const POLL: Duration = Duration::from_secs(1);
/// How often the cached session list is rebuilt while Spotify has sessions.
const RESCAN: Duration = Duration::from_secs(5);

pub(super) fn spawn(app: AppHandle, rx: Receiver<VolumeMsg>) {
    let spawned = std::thread::Builder::new()
        .name("spotify-volume".into())
        .spawn(move || run(app, rx));
    if let Err(e) = spawned {
        eprintln!("[spotify] volume thread failed to start: {e}");
    }
}

fn run(app: AppHandle, rx: Receiver<VolumeMsg>) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let enumerator: IMMDeviceEnumerator =
        match unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) } {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[spotify] no audio device enumerator: {e:?}");
                for VolumeMsg::Set(_, reply) in rx {
                    let _ = reply.send(false);
                }
                return;
            }
        };
    let mut worker = Worker {
        app,
        enumerator,
        sessions: Vec::new(),
        scanned_at: None,
        published: None,
    };
    worker.refresh(true);
    loop {
        match rx.recv_timeout(POLL) {
            Ok(VolumeMsg::Set(level, reply)) => {
                let _ = reply.send(worker.set(level));
                worker.refresh(false);
            }
            Err(RecvTimeoutError::Timeout) => worker.refresh(false),
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

struct Worker {
    app: AppHandle,
    enumerator: IMMDeviceEnumerator,
    /// Spotify's sessions, one per device it has played on.
    sessions: Vec<ISimpleAudioVolume>,
    scanned_at: Option<Instant>,
    published: Option<SpotifyVolume>,
}

impl Worker {
    fn refresh(&mut self, force_scan: bool) {
        let stale = self.scanned_at.is_none_or(|t| t.elapsed() >= RESCAN);
        if force_scan || stale || self.sessions.is_empty() {
            self.scan();
        }
        let mut level = self.read();
        if level.is_none() && !self.sessions.is_empty() {
            self.scan(); // a cached session went away (Spotify quit, device removed)
            level = self.read();
        }
        self.publish(SpotifyVolume {
            available: level.is_some(),
            level: level.map(round_level).unwrap_or(0.0),
        });
    }

    fn scan(&mut self) {
        self.sessions = spotify_sessions(&self.enumerator);
        self.scanned_at = Some(Instant::now());
    }

    fn read(&self) -> Option<f32> {
        self.sessions
            .iter()
            .find_map(|s| unsafe { s.GetMasterVolume() }.ok())
    }

    /// Sets every Spotify session (they normally share one level). True if any took it.
    fn set(&mut self, level: f32) -> bool {
        if self.sessions.is_empty() {
            self.scan();
        }
        let level = level.clamp(0.0, 1.0);
        let mut any = false;
        for session in &self.sessions {
            any |= unsafe { session.SetMasterVolume(level, std::ptr::null()) }.is_ok();
        }
        any
    }

    fn publish(&mut self, next: SpotifyVolume) {
        if self.published == Some(next) {
            return;
        }
        self.app.state::<Spotify>().store_volume(next);
        if let Err(e) = self.app.emit(VOLUME_EVENT, next) {
            eprintln!("[spotify] volume emit failed: {e}");
        }
        self.published = Some(next);
    }
}

fn spotify_sessions(enumerator: &IMMDeviceEnumerator) -> Vec<ISimpleAudioVolume> {
    let mut found = Vec::new();
    let Ok(devices) = (unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) })
    else {
        return found;
    };
    for i in 0..unsafe { devices.GetCount() }.unwrap_or(0) {
        let Ok(device) = (unsafe { devices.Item(i) }) else {
            continue;
        };
        let Ok(manager) = (unsafe { device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) })
        else {
            continue;
        };
        let Ok(sessions) = (unsafe { manager.GetSessionEnumerator() }) else {
            continue;
        };
        for j in 0..unsafe { sessions.GetCount() }.unwrap_or(0) {
            let Ok(control) = (unsafe { sessions.GetSession(j) }) else {
                continue;
            };
            let pid = control
                .cast::<IAudioSessionControl2>()
                .and_then(|c| unsafe { c.GetProcessId() })
                .unwrap_or(0);
            if pid == 0 || !process_path(pid).is_some_and(|p| is_spotify_exe(&p)) {
                continue;
            }
            if let Ok(volume) = control.cast::<ISimpleAudioVolume>() {
                found.push(volume);
            }
        }
    }
    found
}
