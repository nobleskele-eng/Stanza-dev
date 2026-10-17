// The Windows side of `spotify` (see mod.rs): one thread that owns the GSMTC session manager and
// Spotify's session. Ported from the S2 spike with three fixes: it removes its event handlers
// before following a new session (the spike added a fresh set on every session-list change), it
// notices when Spotify's session goes away (the spike kept showing the last track), and it reads
// the artwork only when the track's media properties change (the spike re-encoded it on every
// timeline event).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::mpsc::{Receiver, Sender};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};
use windows::core::{Result as WinResult, HSTRING};
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{
    Buffer, DataReader, IRandomAccessStreamReference, InputStreamOptions,
};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

use super::{
    artwork_data_url, is_spotify, map_status, position_updated_at, resume_anchor, ticks_to_ms,
    Control, Msg, RawStatus, Spotify, SpotifyState, STATE_EVENT,
};

/// Larger thumbnails are ignored (Spotify's are 300x300 PNGs of ~240 kB, DECISIONS.md M1 R1).
const MAX_ARTWORK_BYTES: u32 = 4 * 1024 * 1024;

pub(super) fn spawn(app: AppHandle, tx: Sender<Msg>, rx: Receiver<Msg>) {
    let spawned = std::thread::Builder::new()
        .name("spotify-gsmtc".into())
        .spawn(move || run(app, tx, rx));
    if let Err(e) = spawned {
        eprintln!("[spotify] worker thread failed to start: {e}");
    }
}

/// Which parts of the session to re-read.
#[derive(Default)]
struct Dirty {
    sessions: bool,
    media: bool,
    playback: bool,
}

fn run(app: AppHandle, tx: Sender<Msg>, rx: Receiver<Msg>) {
    // WinRT calls need the thread in an apartment (S2: without it RequestAsync fails or panics).
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let manager = match SessionManager::RequestAsync().and_then(|op| op.get()) {
        Ok(manager) => manager,
        Err(e) => {
            eprintln!("[spotify] no GSMTC session manager: {e:?}");
            // Nothing to read, but answer commands at once instead of letting each one time out.
            for msg in rx {
                if let Msg::Control(_, reply) = msg {
                    let _ = reply.send(false);
                }
            }
            return;
        }
    };
    let on_sessions = tx.clone();
    if let Err(e) = manager.SessionsChanged(&TypedEventHandler::new(move |_, _| {
        let _ = on_sessions.send(Msg::SessionsChanged);
        Ok(())
    })) {
        eprintln!("[spotify] SessionsChanged not registered: {e:?}");
    }

    let mut worker = Worker {
        app,
        tx,
        manager,
        attached: None,
        state: SpotifyState::default(),
        artwork_hash: None,
        next_artwork_id: 1,
        emitted_artwork_id: 0,
    };
    worker.refresh(Dirty {
        sessions: true,
        ..Dirty::default()
    });

    // Runs for the app's lifetime; the manager (and its registration) lives as long as this loop.
    while let Ok(first) = rx.recv() {
        // A track change fires several events together: read and publish once for the whole burst.
        let mut dirty = Dirty::default();
        for msg in std::iter::once(first).chain(rx.try_iter()) {
            match msg {
                Msg::SessionsChanged => dirty.sessions = true,
                Msg::MediaChanged => dirty.media = true,
                Msg::PlaybackChanged | Msg::TimelineChanged => dirty.playback = true,
                Msg::Control(control, reply) => {
                    let _ = reply.send(worker.control(control));
                }
            }
        }
        worker.refresh(dirty);
    }
}

struct Attached {
    session: Session,
    /// MediaPropertiesChanged, PlaybackInfoChanged, TimelinePropertiesChanged.
    tokens: [i64; 3],
}

struct Worker {
    app: AppHandle,
    tx: Sender<Msg>,
    manager: SessionManager,
    attached: Option<Attached>,
    /// The last published state, artwork included.
    state: SpotifyState,
    artwork_hash: Option<u64>,
    next_artwork_id: u32,
    /// The artwork id the last event carried (an event repeats artwork only when this changes).
    emitted_artwork_id: u32,
}

impl Worker {
    fn refresh(&mut self, mut dirty: Dirty) {
        if dirty.sessions && self.rescan() {
            dirty.media = true;
            dirty.playback = true;
        }
        let Some(session) = self.attached.as_ref().map(|a| a.session.clone()) else {
            self.artwork_hash = None;
            self.publish(SpotifyState::default());
            return;
        };
        let mut next = SpotifyState {
            session: true,
            ..self.state.clone()
        };
        if dirty.media {
            self.read_media(&session, &mut next);
        }
        // Track changes move the timeline too, so any change re-reads status and timeline together.
        if dirty.media || dirty.playback {
            read_playback(&session, &mut next);
            read_timeline(&session, &mut next);
            next.position_updated_at = resume_anchor(
                self.state.status,
                next.status,
                next.position_updated_at,
                now_ms(),
            );
        }
        self.publish(next);
    }

    /// Follows Spotify's session if it changed. True when it attached, detached or swapped.
    fn rescan(&mut self) -> bool {
        let found = find_spotify(&self.manager);
        match (&self.attached, &found) {
            (Some(current), Some((session, _))) if current.session == *session => return false,
            (None, None) => return false,
            _ => {}
        }
        if let Some(old) = self.attached.take() {
            detach(old);
        }
        if let Some((session, aumid)) = found {
            // D5: log the real AUMID (it differs between the installer and the Store build).
            eprintln!("[spotify] following GSMTC session {aumid}");
            self.attached = Some(self.attach(session));
        }
        true
    }

    fn attach(&self, session: Session) -> Attached {
        let tx = self.tx.clone();
        let media = session.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
            let _ = tx.send(Msg::MediaChanged);
            Ok(())
        }));
        let tx = self.tx.clone();
        let playback = session.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
            let _ = tx.send(Msg::PlaybackChanged);
            Ok(())
        }));
        let tx = self.tx.clone();
        let timeline = session.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
            let _ = tx.send(Msg::TimelineChanged);
            Ok(())
        }));
        let tokens = [media, playback, timeline].map(|t| t.unwrap_or_default());
        Attached { session, tokens }
    }

    fn read_media(&mut self, session: &Session, next: &mut SpotifyState) {
        let Ok(props) = session.TryGetMediaPropertiesAsync().and_then(|op| op.get()) else {
            return;
        };
        let text = |r: WinResult<HSTRING>| r.map(|s| s.to_string_lossy()).unwrap_or_default();
        next.title = text(props.Title());
        next.artist = text(props.Artist());
        next.album = text(props.AlbumTitle());

        let bytes = props.Thumbnail().ok().and_then(|t| read_stream(&t));
        let hash = bytes.as_deref().map(|b| {
            let mut h = DefaultHasher::new();
            b.hash(&mut h);
            h.finish()
        });
        if hash == self.artwork_hash {
            return; // same image: keep its id, so events don't resend it
        }
        self.artwork_hash = hash;
        match bytes.as_deref().and_then(artwork_data_url) {
            Some(url) => {
                next.artwork_id = self.next_artwork_id;
                next.artwork = Some(url);
                self.next_artwork_id = self.next_artwork_id.checked_add(1).unwrap_or(1);
            }
            None => {
                next.artwork_id = 0;
                next.artwork = None;
            }
        }
    }

    fn publish(&mut self, mut next: SpotifyState) {
        next.seq = self.state.seq;
        if next == self.state {
            return;
        }
        next.seq += 1;
        self.app.state::<Spotify>().store(&next);
        let mut event = next.clone();
        if event.artwork_id == self.emitted_artwork_id {
            event.artwork = None;
        }
        self.emitted_artwork_id = event.artwork_id;
        if let Err(e) = self.app.emit(STATE_EVENT, &event) {
            eprintln!("[spotify] emit failed: {e}");
        }
        self.state = next;
    }

    fn control(&self, control: Control) -> bool {
        let Some(attached) = &self.attached else {
            return false;
        };
        let s = &attached.session;
        let op = match control {
            Control::PlayPause => s.TryTogglePlayPauseAsync(),
            Control::Next => s.TrySkipNextAsync(),
            Control::Previous => s.TrySkipPreviousAsync(),
            Control::Seek(ms) => s.TryChangePlaybackPositionAsync(ms.saturating_mul(10_000)),
        };
        op.and_then(|op| op.get()).unwrap_or(false)
    }
}

fn detach(old: Attached) {
    // Errors are expected when the session already ended with Spotify; nothing to clean up then.
    let [media, playback, timeline] = old.tokens;
    let _ = old.session.RemoveMediaPropertiesChanged(media);
    let _ = old.session.RemovePlaybackInfoChanged(playback);
    let _ = old.session.RemoveTimelinePropertiesChanged(timeline);
}

fn find_spotify(manager: &SessionManager) -> Option<(Session, String)> {
    let sessions = manager.GetSessions().ok()?;
    (0..sessions.Size().ok()?)
        .filter_map(|i| sessions.GetAt(i).ok())
        .find_map(|session| {
            let aumid = session.SourceAppUserModelId().ok()?.to_string_lossy();
            is_spotify(&aumid).then_some((session, aumid))
        })
}

fn read_playback(session: &Session, next: &mut SpotifyState) {
    let Ok(info) = session.GetPlaybackInfo() else {
        return;
    };
    if let Ok(status) = info.PlaybackStatus() {
        next.status = map_status(raw_status(status), next.status);
    }
    next.can_seek = info
        .Controls()
        .and_then(|c| c.IsPlaybackPositionEnabled())
        .unwrap_or(false);
}

fn read_timeline(session: &Session, next: &mut SpotifyState) {
    let Ok(timeline) = session.GetTimelineProperties() else {
        return;
    };
    let ms = |r: WinResult<TimeSpan>| r.map(|t| ticks_to_ms(t.Duration)).unwrap_or(0);
    next.position_ms = ms(timeline.Position()).max(0);
    next.duration_ms = (ms(timeline.EndTime()) - ms(timeline.StartTime())).max(0);
    let updated = timeline
        .LastUpdatedTime()
        .map(|d| d.UniversalTime)
        .unwrap_or(0);
    next.position_updated_at = position_updated_at(updated, now_ms());
}

fn raw_status(status: PlaybackStatus) -> RawStatus {
    match status {
        PlaybackStatus::Playing => RawStatus::Playing,
        PlaybackStatus::Paused => RawStatus::Paused,
        PlaybackStatus::Changing => RawStatus::Changing,
        PlaybackStatus::Opened => RawStatus::Opened,
        PlaybackStatus::Stopped => RawStatus::Stopped,
        _ => RawStatus::Closed,
    }
}

fn read_stream(reference: &IRandomAccessStreamReference) -> Option<Vec<u8>> {
    let stream = reference.OpenReadAsync().ok()?.get().ok()?;
    let size = u32::try_from(stream.Size().ok()?)
        .ok()
        .filter(|&s| s > 0 && s <= MAX_ARTWORK_BYTES)?;
    let buffer = Buffer::Create(size).ok()?;
    let filled = stream
        .ReadAsync(&buffer, size, InputStreamOptions::ReadAhead)
        .ok()?
        .get()
        .ok()?;
    let reader = DataReader::FromBuffer(&filled).ok()?;
    let mut bytes = vec![0u8; filled.Length().ok()? as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    Some(bytes)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
