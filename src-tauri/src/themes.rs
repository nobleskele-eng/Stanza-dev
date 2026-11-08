// User themes (PLAN.md §4 "Loading and hot swap", M3 L2): one folder per theme in `<app data dir>/themes/<id>/`
// (`%APPDATA%\com.stanza.app\themes\` on Windows), holding `theme.json` and `theme.css` (plus anything the CSS
// points at with a relative `url()`). This module only finds and checks them; the frontend loads the CSS through
// the asset protocol, whose scope in tauri.conf.json is that folder and nothing else (`src/theme/userThemes.ts`).
//
// Everything on disk is untrusted. A folder that fails a check is reported as `broken` with a machine code, never
// prose (displayed text comes from docs/COPY.md; "Theme failed to load" is still [NEEDS COPY]). Read-only: nothing
// here creates, moves or deletes a file.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Must equal `CONTRACT_VERSION` in src/theme/variant.ts (src/theme/userThemes.test.ts compares them).
pub const CONTRACT_VERSION: u64 = 12;
/// The layouts a theme may declare (`Layout` in src/player/Player.tsx).
const LAYOUTS: [&str; 3] = ["pill", "card", "strip"];
const MAX_JSON_BYTES: u64 = 64 * 1024;
const MAX_CSS_BYTES: u64 = 512 * 1024;
/// More folders than this are ignored (sorted by name, the first ones kept).
const MAX_THEMES: usize = 64;
const MAX_ID_CHARS: usize = 40;
const MAX_NAME_CHARS: usize = 80;
/// The native window, logical px, on each side. Every shipped theme is well inside it.
const WINDOW_MIN: f64 = 40.0;
const WINDOW_MAX: f64 = 1600.0;

/// One folder under `themes/`, as the frontend receives it (`UserThemeEntry` in src/theme/userThemes.ts).
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum UserTheme {
    /// Passed every check here. `manifest` is theme.json as written (the frontend picks the fields it knows and
    /// checks the optional ones); `css` is the absolute path of its theme.css.
    Ok { folder: String, manifest: Value, css: String },
    /// Failed a check: `error` is a machine code.
    Broken { folder: String, error: &'static str },
}

/// The ids are folder names too: lowercase letters and digits in words joined by single hyphens.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.chars().count() <= MAX_ID_CHARS
        && id.split('-').all(|w| !w.is_empty() && w.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

/// A regular file (not a link, which could point out of the asset scope) no bigger than `max` bytes.
fn small_file(path: &Path, max: u64, missing: &'static str) -> Result<(), &'static str> {
    let meta = fs::symlink_metadata(path).map_err(|_| missing)?;
    if meta.file_type().is_symlink() {
        return Err("link");
    }
    if !meta.is_file() {
        return Err(missing);
    }
    if meta.len() > max {
        return Err("too-large");
    }
    Ok(())
}

fn check_window(v: Option<&Value>) -> bool {
    let Some(w) = v.and_then(Value::as_object) else { return false };
    ["width", "height"].iter().all(|k| {
        w.get(*k).and_then(Value::as_f64).is_some_and(|n| n.is_finite() && (WINDOW_MIN..=WINDOW_MAX).contains(&n))
    })
}

fn check_manifest(manifest: &Value, folder: &str) -> Result<(), &'static str> {
    let m = manifest.as_object().ok_or("not-object")?;
    match m.get("id").and_then(Value::as_str) {
        None => return Err("bad-id"),
        Some(id) if id != folder => return Err("id-not-folder"),
        Some(_) => {}
    }
    let name = m.get("name").and_then(Value::as_str).map(str::trim).ok_or("bad-name")?;
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS || name.chars().any(char::is_control) {
        return Err("bad-name");
    }
    if m.get("contract").and_then(Value::as_u64) != Some(CONTRACT_VERSION) {
        return Err("contract-mismatch");
    }
    if !m.get("layout").and_then(Value::as_str).is_some_and(|l| LAYOUTS.contains(&l)) {
        return Err("bad-layout");
    }
    if let Some(extra) = m.get("layouts") {
        let ok = extra.as_array().is_some_and(|a| a.iter().all(|l| l.as_str().is_some_and(|l| LAYOUTS.contains(&l))));
        if !ok {
            return Err("bad-layout");
        }
    }
    if !check_window(m.get("window")) {
        return Err("bad-window");
    }
    Ok(())
}

/// Checks one folder; on success, theme.json's value and theme.css's path.
fn read_theme(dir: &Path, folder: &str) -> Result<(Value, PathBuf), &'static str> {
    if !valid_id(folder) {
        return Err("bad-folder");
    }
    let json_path = dir.join("theme.json");
    small_file(&json_path, MAX_JSON_BYTES, "no-json")?;
    let text = fs::read_to_string(&json_path).map_err(|_| "unreadable")?;
    let manifest: Value = serde_json::from_str(&text).map_err(|_| "not-json")?;
    check_manifest(&manifest, folder)?;
    let css = dir.join("theme.css");
    small_file(&css, MAX_CSS_BYTES, "no-css")?;
    Ok((manifest, css))
}

/// Every folder in `root`, sorted by name; links and anything that isn't a folder are skipped. No folder: none.
pub fn scan(root: &Path) -> Vec<UserTheme> {
    let Ok(entries) = fs::read_dir(root) else { return Vec::new() };
    let mut dirs: Vec<(String, PathBuf)> = entries
        .filter_map(Result::ok)
        // `DirEntry::file_type` doesn't follow links, so a linked folder (or a junction) is not a dir here.
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .filter_map(|e| Some((e.file_name().into_string().ok()?, e.path())))
        .collect();
    dirs.sort();
    dirs.truncate(MAX_THEMES);
    dirs.into_iter()
        .map(|(folder, dir)| match read_theme(&dir, &folder) {
            Ok((manifest, css)) => UserTheme::Ok { folder, manifest, css: css.to_string_lossy().into_owned() },
            Err(error) => UserTheme::Broken { folder, error },
        })
        .collect()
}

/// `<app data dir>/themes`. Built with `join` on the app data dir, never canonicalized: the asset scope matches the
/// plain path, and canonicalizing adds Windows' `\\?\` prefix, which silently fails it (S4, DECISIONS.md 2026-09-17).
pub fn themes_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("themes"))
}

/// The user themes, read fresh on every call (async: file reads stay off the main thread).
#[tauri::command]
pub async fn user_themes(app: AppHandle) -> Vec<UserTheme> {
    themes_dir(&app).map(|d| scan(&d)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// A fresh, empty folder under the system temp dir, removed when dropped.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let p = std::env::temp_dir().join(format!("stanza-themes-test-{tag}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&p).unwrap();
            TempDir(p)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn good(id: &str) -> Value {
        json!({ "id": id, "name": "Paper", "contract": CONTRACT_VERSION, "layout": "card", "window": { "width": 340, "height": 520 } })
    }

    fn write(root: &Path, folder: &str, manifest: Option<&str>, css: Option<&str>) {
        let dir = root.join(folder);
        fs::create_dir_all(&dir).unwrap();
        if let Some(m) = manifest {
            fs::write(dir.join("theme.json"), m).unwrap();
        }
        if let Some(c) = css {
            fs::write(dir.join("theme.css"), c).unwrap();
        }
    }

    fn only(root: &Path) -> UserTheme {
        let mut all = scan(root);
        assert_eq!(all.len(), 1, "{all:?}");
        all.remove(0)
    }

    fn error_for(manifest: Value) -> &'static str {
        let t = TempDir::new("err");
        write(&t.0, "paper", Some(&manifest.to_string()), Some(".mp-root{}"));
        match only(&t.0) {
            UserTheme::Broken { error, .. } => error,
            ok => panic!("expected broken, got {ok:?}"),
        }
    }

    #[test]
    fn no_folder_means_no_themes() {
        let t = TempDir::new("none");
        assert_eq!(scan(&t.0.join("missing")), vec![]);
        assert_eq!(scan(&t.0), vec![]);
    }

    #[test]
    fn a_good_theme_comes_back_whole_with_its_css_path() {
        let t = TempDir::new("good");
        let manifest = good("paper-2");
        write(&t.0, "paper-2", Some(&manifest.to_string()), Some(".mp-root{}"));
        let css = t.0.join("paper-2").join("theme.css").to_string_lossy().into_owned();
        assert_eq!(only(&t.0), UserTheme::Ok { folder: "paper-2".into(), manifest, css: css.clone() });
        assert!(!css.starts_with(r"\\?\"), "never the extended-length prefix (S4)");
    }

    #[test]
    fn folders_are_sorted_and_files_and_odd_names_skipped_or_refused() {
        let t = TempDir::new("sort");
        for id in ["zeta", "alpha"] {
            write(&t.0, id, Some(&good(id).to_string()), Some(""));
        }
        fs::write(t.0.join("loose.css"), "").unwrap();
        write(&t.0, "Bad_Name", Some(&good("Bad_Name").to_string()), Some(""));
        let got: Vec<(String, bool)> = scan(&t.0)
            .into_iter()
            .map(|e| match e {
                UserTheme::Ok { folder, .. } => (folder, true),
                UserTheme::Broken { folder, error } => {
                    assert_eq!(error, "bad-folder");
                    (folder, false)
                }
            })
            .collect();
        assert_eq!(got, vec![("Bad_Name".into(), false), ("alpha".into(), true), ("zeta".into(), true)]);
    }

    #[test]
    fn ids() {
        for ok in ["a", "paper", "t6-night", "a1-b2-c3"] {
            assert!(valid_id(ok), "{ok}");
        }
        for bad in ["", "-a", "a-", "a--b", "A", "a_b", "a.b", "a b", "ä", &"a".repeat(41)] {
            assert!(!valid_id(bad), "{bad}");
        }
    }

    #[test]
    fn every_manifest_check_has_its_code() {
        let with = |k: &str, v: Value| {
            let mut m = good("paper");
            m[k] = v;
            m
        };
        let without = |k: &str| {
            let mut m = good("paper");
            m.as_object_mut().unwrap().remove(k);
            m
        };
        assert_eq!(error_for(json!([1, 2])), "not-object");
        assert_eq!(error_for(without("id")), "bad-id");
        assert_eq!(error_for(with("id", json!("other"))), "id-not-folder");
        assert_eq!(error_for(without("name")), "bad-name");
        assert_eq!(error_for(with("name", json!("   "))), "bad-name");
        assert_eq!(error_for(with("name", json!("tab\there"))), "bad-name");
        assert_eq!(error_for(with("name", json!("x".repeat(81)))), "bad-name");
        assert_eq!(error_for(with("contract", json!(11))), "contract-mismatch");
        assert_eq!(error_for(with("contract", json!("12"))), "contract-mismatch");
        assert_eq!(error_for(with("layout", json!("grid"))), "bad-layout");
        assert_eq!(error_for(with("layouts", json!(["card", "grid"]))), "bad-layout");
        assert_eq!(error_for(with("window", json!({ "width": 340 }))), "bad-window");
        assert_eq!(error_for(with("window", json!({ "width": 10, "height": 520 }))), "bad-window");
        assert_eq!(error_for(with("window", json!({ "width": 340, "height": 5000 }))), "bad-window");
        // Optional fields the frontend checks (fx, companion, controls) pass through untouched.
        assert!(matches!(
            {
                let t = TempDir::new("extra");
                let m = with("fx", json!({ "shapes": true }));
                write(&t.0, "paper", Some(&m.to_string()), Some(""));
                only(&t.0)
            },
            UserTheme::Ok { .. }
        ));
    }

    #[test]
    fn file_problems_have_their_codes() {
        let cases: [(&str, Option<String>, Option<String>, &str); 5] = [
            ("no json", None, Some(String::new()), "no-json"),
            ("not json", Some("{ nope".into()), Some(String::new()), "not-json"),
            ("no css", Some(good("paper").to_string()), None, "no-css"),
            ("huge json", Some(format!("{} {}", good("paper"), " ".repeat(70_000))), Some(String::new()), "too-large"),
            ("huge css", Some(good("paper").to_string()), Some("a".repeat(600_000)), "too-large"),
        ];
        for (what, json, css, code) in cases {
            let t = TempDir::new("files");
            write(&t.0, "paper", json.as_deref(), css.as_deref());
            assert_eq!(only(&t.0), UserTheme::Broken { folder: "paper".into(), error: code }, "{what}");
        }
    }

    #[test]
    fn a_folder_named_theme_css_is_not_a_stylesheet() {
        let t = TempDir::new("dircss");
        write(&t.0, "paper", Some(&good("paper").to_string()), None);
        fs::create_dir_all(t.0.join("paper").join("theme.css")).unwrap();
        assert_eq!(only(&t.0), UserTheme::Broken { folder: "paper".into(), error: "no-css" });
    }

    #[test]
    fn serialises_the_way_the_frontend_reads_it() {
        let ok = UserTheme::Ok { folder: "a".into(), manifest: json!({}), css: "c".into() };
        assert_eq!(serde_json::to_value(ok).unwrap(), json!({ "kind": "ok", "folder": "a", "manifest": {}, "css": "c" }));
        let broken = UserTheme::Broken { folder: "a".into(), error: "no-css" };
        assert_eq!(serde_json::to_value(broken).unwrap(), json!({ "kind": "broken", "folder": "a", "error": "no-css" }));
    }
}
