// Live reload for user themes (PLAN.md §4 "Loading and hot swap", M3 L3): watches `<app data dir>` and tells the
// frontend which folders under `themes/` changed, so a theme you're editing updates on screen as you save
// (src/theme/liveThemes.ts does the swap). The S4 spike's method (a `notify` watcher emitting a Tauri event), with
// the burst of events one save makes collapsed into one.
//
// It watches the app data dir, not `themes/` itself: `themes/` may not exist yet (a person creates it to add their
// first theme), and it may be deleted or renamed while the app runs; a watch on a folder that goes away sees nothing
// after. Everything outside `themes/` (the window-state file, say) is ignored. Reading never counts as a change, so
// the app reading a theme can't set off another reload.

use std::collections::BTreeSet;
use std::path::{Component, Path};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// The Tauri event (`THEMES_CHANGED` in src/theme/liveThemes.ts).
pub const EVENT: &str = "themes:changed";
/// A save is a burst of events (truncate, write, rename): this long without another ends the burst.
const QUIET: Duration = Duration::from_millis(120);
/// A burst that never goes quiet (a folder being copied in) is still reported this often.
const MAX_WAIT: Duration = Duration::from_millis(1000);

/// What changed under `themes/` (`ThemesChanged` in src/theme/liveThemes.ts).
#[derive(Debug, Default, Clone, PartialEq, Serialize)]
pub struct ThemesChanged {
    /// Theme folders with something changed in them, or the folder itself added, removed or renamed. Sorted.
    pub folders: Vec<String>,
    /// `themes/` itself appeared, went or was renamed, or the watcher lost track: any theme may have changed.
    pub all: bool,
}

#[derive(Default)]
struct Burst {
    folders: BTreeSet<String>,
    all: bool,
}

impl Burst {
    fn is_empty(&self) -> bool {
        self.folders.is_empty() && !self.all
    }
    fn into_change(self) -> ThemesChanged {
        ThemesChanged { folders: self.folders.into_iter().collect(), all: self.all }
    }
}

/// Adds what one path under the watched `root` touched to `burst`; false if it's outside `root/themes`.
/// Windows and macOS file names ignore case, so `Themes` is the same folder.
fn add_path(root: &Path, path: &Path, burst: &mut Burst) -> bool {
    let Ok(rel) = path.strip_prefix(root) else { return false };
    let mut parts = rel.components().filter(|c| !matches!(c, Component::CurDir));
    match parts.next() {
        Some(Component::Normal(first)) if first.to_str().is_some_and(|s| s.eq_ignore_ascii_case("themes")) => {}
        _ => return false,
    }
    match parts.next() {
        Some(Component::Normal(folder)) => match folder.to_str() {
            Some(name) => {
                burst.folders.insert(name.to_owned());
            }
            // Not valid Unicode: never a theme id, but say something changed.
            None => burst.all = true,
        },
        // `themes/` itself.
        _ => burst.all = true,
    }
    true
}

/// Adds one watcher event to `burst`; false if it concerned nothing under `themes/`.
fn add_event(root: &Path, event: &notify::Result<Event>, burst: &mut Burst) -> bool {
    match event {
        Ok(e) if matches!(e.kind, EventKind::Access(_)) => false,
        Ok(e) if e.need_rescan() => {
            burst.all = true;
            true
        }
        Ok(e) => e.paths.iter().fold(false, |hit, p| add_path(root, p, burst) | hit),
        // The watcher lost events (a buffer overflow, say): assume anything changed.
        Err(err) if err.paths.is_empty() => {
            burst.all = true;
            true
        }
        Err(err) => err.paths.iter().fold(false, |hit, p| add_path(root, p, burst) | hit),
    }
}

/// Reads events until the sender goes, reporting each burst that touched `themes/` once, after it goes quiet.
fn run(rx: Receiver<notify::Result<Event>>, root: &Path, quiet: Duration, max_wait: Duration, mut emit: impl FnMut(ThemesChanged)) {
    loop {
        let mut burst = Burst::default();
        // Wait for the first event that matters.
        while burst.is_empty() {
            match rx.recv() {
                Ok(event) => {
                    add_event(root, &event, &mut burst);
                }
                Err(_) => return,
            }
        }
        let start = Instant::now();
        let gone = loop {
            let left = max_wait.saturating_sub(start.elapsed());
            if left.is_zero() {
                break false;
            }
            match rx.recv_timeout(quiet.min(left)) {
                Ok(event) => {
                    add_event(root, &event, &mut burst);
                }
                Err(RecvTimeoutError::Timeout) => break false,
                Err(RecvTimeoutError::Disconnected) => break true,
            }
        };
        emit(burst.into_change());
        if gone {
            return;
        }
    }
}

/// Starts the watcher on its own thread. It creates the app data dir if it isn't there yet (the app's own folder;
/// `themes/` inside it is left to the person). If the watcher can't start, the app works as before: themes added or
/// edited show at the next launch.
pub fn start(app: &AppHandle) {
    let Ok(root) = app.path().app_data_dir() else { return };
    let app = app.clone();
    let spawned = std::thread::Builder::new().name("theme-watch".into()).spawn(move || {
        if let Err(e) = std::fs::create_dir_all(&root) {
            eprintln!("theme watch: no app data dir: {e}");
            return;
        }
        let (tx, rx) = channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("theme watch: no watcher: {e}");
                return;
            }
        };
        if let Err(e) = watcher.watch(&root, RecursiveMode::Recursive) {
            eprintln!("theme watch: can't watch the app data dir: {e}");
            return;
        }
        run(rx, &root, QUIET, MAX_WAIT, |change| {
            let _ = app.emit(EVENT, change);
        });
        drop(watcher);
    });
    if let Err(e) = spawned {
        eprintln!("theme watch: no thread: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind};
    use std::path::PathBuf;
    use std::sync::mpsc::Sender;
    use std::thread;

    /// Where a watcher event would put a file under `root`.
    fn under(root: &Path, parts: &[&str]) -> PathBuf {
        parts.iter().fold(root.to_path_buf(), |p, s| p.join(s))
    }

    fn root() -> PathBuf {
        PathBuf::from(if cfg!(windows) { r"C:\data\com.stanza.app" } else { "/data/com.stanza.app" })
    }

    fn event(kind: EventKind, paths: &[PathBuf]) -> notify::Result<Event> {
        Ok(paths.iter().fold(Event::new(kind), |e, p| e.add_path(p.clone())))
    }

    fn touched(events: &[notify::Result<Event>]) -> (bool, ThemesChanged) {
        let mut burst = Burst::default();
        let hit = events.iter().fold(false, |hit, e| add_event(&root(), e, &mut burst) | hit);
        (hit, burst.into_change())
    }

    fn change(folders: &[&str], all: bool) -> ThemesChanged {
        ThemesChanged { folders: folders.iter().map(|s| s.to_string()).collect(), all }
    }

    #[test]
    fn files_in_a_theme_folder_name_that_folder() {
        let r = root();
        let (hit, got) = touched(&[
            event(EventKind::Modify(ModifyKind::Any), &[under(&r, &["themes", "paper", "theme.css"])]),
            event(EventKind::Create(CreateKind::File), &[under(&r, &["themes", "paper", "img", "bg.svg"])]),
            event(EventKind::Create(CreateKind::Folder), &[under(&r, &["themes", "ink"])]),
            // A rename names both sides.
            event(EventKind::Modify(ModifyKind::Any), &[under(&r, &["Themes", "old"]), under(&r, &["themes", "new"])]),
        ]);
        assert!(hit);
        assert_eq!(got, change(&["ink", "new", "old", "paper"], false));
    }

    #[test]
    fn the_themes_folder_itself_means_any_theme() {
        let (hit, got) = touched(&[event(EventKind::Remove(RemoveKind::Folder), &[under(&root(), &["themes"])])]);
        assert!(hit);
        assert_eq!(got, change(&[], true));
    }

    #[test]
    fn anything_outside_themes_and_any_read_is_ignored() {
        let r = root();
        let (hit, got) = touched(&[
            event(EventKind::Modify(ModifyKind::Any), &[under(&r, &[".window-state.json"])]),
            event(EventKind::Create(CreateKind::Folder), &[under(&r, &["snippets", "a.css"])]),
            event(EventKind::Modify(ModifyKind::Any), &[under(&r, &["themes-old", "paper", "theme.css"])]),
            event(EventKind::Modify(ModifyKind::Any), &[PathBuf::from("elsewhere").join("themes").join("paper")]),
            event(EventKind::Access(AccessKind::Any), &[under(&r, &["themes", "paper", "theme.css"])]),
        ]);
        assert!(!hit);
        assert_eq!(got, change(&[], false));
    }

    #[test]
    fn a_lost_track_watcher_means_any_theme() {
        let rescan = Ok(Event::new(EventKind::Other).set_flag(notify::event::Flag::Rescan));
        assert_eq!(touched(&[rescan]), (true, change(&[], true)));
        assert_eq!(touched(&[Err(notify::Error::generic("overflow"))]), (true, change(&[], true)));
    }

    /// `run` on its own thread, its reports on a channel.
    fn harness(quiet: Duration, max_wait: Duration) -> (Sender<notify::Result<Event>>, Receiver<ThemesChanged>, thread::JoinHandle<()>) {
        let (tx, rx) = channel();
        let (out_tx, out) = channel();
        let r = root();
        let join = thread::spawn(move || run(rx, &r, quiet, max_wait, |c| out_tx.send(c).unwrap()));
        (tx, out, join)
    }

    fn css(folder: &str) -> notify::Result<Event> {
        event(EventKind::Modify(ModifyKind::Any), &[under(&root(), &["themes", folder, "theme.css"])])
    }

    #[test]
    fn one_burst_one_report() {
        let (tx, out, join) = harness(Duration::from_millis(80), Duration::from_secs(5));
        for folder in ["paper", "paper", "ink", "paper"] {
            tx.send(css(folder)).unwrap();
        }
        assert_eq!(out.recv_timeout(Duration::from_secs(2)).unwrap(), change(&["ink", "paper"], false));
        // Quiet again: a later save is its own report.
        tx.send(css("ink")).unwrap();
        assert_eq!(out.recv_timeout(Duration::from_secs(2)).unwrap(), change(&["ink"], false));
        drop(tx);
        join.join().unwrap();
        assert!(out.try_recv().is_err());
    }

    #[test]
    fn events_outside_themes_report_nothing() {
        let (tx, out, join) = harness(Duration::from_millis(40), Duration::from_secs(5));
        tx.send(event(EventKind::Modify(ModifyKind::Any), &[under(&root(), &[".window-state.json"])])).unwrap();
        assert!(out.recv_timeout(Duration::from_millis(300)).is_err());
        drop(tx);
        join.join().unwrap();
    }

    #[test]
    fn a_burst_that_never_goes_quiet_is_still_reported() {
        let (tx, out, join) = harness(Duration::from_millis(200), Duration::from_millis(300));
        let t0 = Instant::now();
        // Every 50 ms for a second: never quiet for 200 ms.
        let feeder = thread::spawn(move || {
            for _ in 0..20 {
                tx.send(css("paper")).unwrap();
                thread::sleep(Duration::from_millis(50));
            }
        });
        out.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(t0.elapsed() < Duration::from_millis(900), "reported before the burst ended: {:?}", t0.elapsed());
        feeder.join().unwrap();
        join.join().unwrap();
    }

    #[test]
    fn a_report_pending_when_the_watcher_stops_is_still_sent() {
        let (tx, out, join) = harness(Duration::from_secs(5), Duration::from_secs(10));
        tx.send(css("paper")).unwrap();
        drop(tx);
        join.join().unwrap();
        assert_eq!(out.try_recv().unwrap(), change(&["paper"], false));
    }

    #[test]
    fn serialises_the_way_the_frontend_reads_it() {
        assert_eq!(serde_json::to_value(change(&["paper"], false)).unwrap(), serde_json::json!({ "folders": ["paper"], "all": false }));
    }

    /// The real watcher on a temp folder: creating, editing and deleting a theme's files is seen and reported by folder.
    #[test]
    fn the_real_watcher_sees_a_theme_being_made_edited_and_removed() {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let data = std::env::temp_dir().join(format!("stanza-watch-test-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&data).unwrap();
        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(tx).unwrap();
        watcher.watch(&data, RecursiveMode::Recursive).unwrap();
        let (out_tx, out) = channel();
        let root = data.clone();
        let join = thread::spawn(move || run(rx, &root, QUIET, MAX_WAIT, |c| out_tx.send(c).unwrap()));
        let next = || out.recv_timeout(Duration::from_secs(5)).expect("a report");
        // Noise outside themes/ first: never reported.
        std::fs::write(data.join(".window-state.json"), "{}").unwrap();

        let dir = data.join("themes").join("paper");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("theme.css"), "a{}").unwrap();
        let first = next();
        assert!(first.all || first.folders == ["paper"], "{first:?}");

        thread::sleep(Duration::from_millis(300));
        std::fs::write(dir.join("theme.css"), "b{}").unwrap();
        assert_eq!(next(), change(&["paper"], false));

        thread::sleep(Duration::from_millis(300));
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(next(), change(&["paper"], false));

        drop(watcher);
        join.join().unwrap();
        let _ = std::fs::remove_dir_all(&data);
    }
}
