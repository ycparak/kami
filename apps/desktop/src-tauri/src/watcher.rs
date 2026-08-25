use crate::ignore::{is_gitignore_path, WorkspaceIgnore};
use crate::state::{self, AppState, WorkspaceState};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SELF_WRITE_TTL: Duration = Duration::from_secs(2);
const DEBOUNCE_MS: u64 = 300;

fn watcher_log_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var_os("KAMI_WATCHER_LOG").is_some())
}

macro_rules! wlog {
    ($($arg:tt)*) => {
        if watcher_log_enabled() {
            eprintln!("[watcher] {}", format!($($arg)*));
        }
    };
}

#[derive(Debug, Clone, Serialize)]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
}

fn should_ignore(path: &Path, workspace_root: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(workspace_root) else {
        return false;
    };
    for component in relative.components() {
        let name = component.as_os_str().to_string_lossy();
        if name == ".git" || name == "node_modules" || name == ".DS_Store" {
            return true;
        }
        if name == ".kami" || name == ".gitignore" {
            continue;
        }
        if name.starts_with('.') && name.len() > 1 {
            return true;
        }
    }
    false
}

fn is_workspace_ignored(state: &WorkspaceState, path: &Path, is_dir: bool) -> bool {
    let guard = state.workspace_ignore.read();
    guard
        .as_ref()
        .map(|ignore| ignore.is_ignored(path, is_dir))
        .unwrap_or(false)
}

fn is_config_file(path: &Path) -> bool {
    if path.file_name().and_then(|n| n.to_str()) == Some("config") {
        if let Some(parent) = path.parent() {
            if parent.file_name().and_then(|n| n.to_str()) == Some(".kami") {
                return true;
            }
        }
    }
    false
}

fn is_self_write(state: &WorkspaceState, path: &Path) -> bool {
    let writes = state.recent_writes.read();
    let hit = writes
        .get(path)
        .is_some_and(|written_at| written_at.elapsed() < SELF_WRITE_TTL);
    if hit {
        wlog!(
            "self-write suppressed: {} ({} tracked)",
            path.display(),
            writes.len()
        );
    }
    hit
}

pub fn record_write(state: &WorkspaceState, path: &Path) {
    let mut writes = state.recent_writes.write();
    writes.insert(path.to_path_buf(), Instant::now());

    writes.retain(|_, t| t.elapsed() < SELF_WRITE_TTL);
    wlog!(
        "record_write: {} ({} tracked)",
        path.display(),
        writes.len()
    );
}

fn add_to_index(state: &WorkspaceState, path: &Path, root: &Path) {
    let mut index = state.file_index.write();
    let modified_at = crate::commands::fs::modified_time(path);
    if let Some(file) = index.iter_mut().find(|f| f.path == path) {
        if file.modified_at != modified_at {
            file.modified_at = modified_at;
            drop(index);
            state.invalidate_recent_files_cache();
        }
        return;
    }
    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    index.push(crate::state::IndexedFile {
        path: path.to_path_buf(),
        relative_path: rel,
        name,
        modified_at,
    });
    drop(index);
    state.invalidate_recent_files_cache();

    state::register_ancestors(&mut state.dirs_with_markdown.write(), path, root);
}

fn remove_from_index(state: &WorkspaceState, path: &Path, root: &Path) {
    let removed = {
        let mut index = state.file_index.write();
        let before = index.len();
        index.retain(|f| f.path != path);
        before != index.len()
    };
    if removed {
        state.invalidate_recent_files_cache();
    }
    let index = state.file_index.read();
    *state.dirs_with_markdown.write() = state::rebuild_dirs_from_index(&index, root);
}

fn remove_subtree_from_index(state: &WorkspaceState, dir: &Path, root: &Path) {
    let dir_with_sep = {
        let mut s = dir.to_path_buf();
        s.push("");
        s
    };
    let removed = {
        let mut index = state.file_index.write();
        let before = index.len();
        index.retain(|f| !f.path.starts_with(&dir_with_sep) && f.path != dir);
        before != index.len()
    };
    if removed {
        state.invalidate_recent_files_cache();
    }
    let index = state.file_index.read();
    *state.dirs_with_markdown.write() = state::rebuild_dirs_from_index(&index, root);
}

fn add_subtree_to_index(state: &WorkspaceState, dir: &Path, root: &Path) {
    let cancel = Arc::new(AtomicBool::new(false));
    let (found, _) = crate::commands::search::index_workspace_impl(dir, cancel);
    if found.is_empty() {
        return;
    }

    let mut added = Vec::new();
    {
        let mut index = state.file_index.write();
        for file in found {
            if index.iter().any(|f| f.path == file.path) {
                continue;
            }
            let rel = file
                .path
                .strip_prefix(root)
                .unwrap_or(&file.path)
                .to_string_lossy()
                .to_string();
            let path = file.path.clone();
            index.push(crate::state::IndexedFile {
                path: file.path,
                relative_path: rel,
                name: file.name,
                modified_at: file.modified_at,
            });
            added.push(path);
        }
    }

    if added.is_empty() {
        return;
    }
    state.invalidate_recent_files_cache();
    let mut dirs = state.dirs_with_markdown.write();
    for p in added {
        state::register_ancestors(&mut dirs, &p, root);
    }
}

fn event_kind_str(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("created"),
        EventKind::Modify(_) => Some("modified"),
        EventKind::Remove(_) => Some("deleted"),
        _ => None,
    }
}

pub fn start_watcher(
    app_handle: AppHandle,
    window_label: String,
    root: &Path,
    epoch: u64,
) -> Result<RecommendedWatcher, notify::Error> {
    let root_path = root.to_path_buf();
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();

    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        notify::Config::default().with_poll_interval(Duration::from_millis(DEBOUNCE_MS)),
    )?;

    watcher.watch(&root_path, RecursiveMode::Recursive)?;

    let captured_epoch = epoch;

    let handle = app_handle.clone();
    let label = window_label.clone();
    std::thread::spawn(move || {
        let mut last_emit = Instant::now();
        let mut pending: Vec<Event> = Vec::new();

        loop {
            match rx.recv_timeout(Duration::from_millis(DEBOUNCE_MS)) {
                Ok(Ok(event)) => {
                    wlog!(
                        "recv: kind={:?} paths={:?}",
                        event.kind,
                        event
                            .paths
                            .iter()
                            .map(|p| p.display().to_string())
                            .collect::<Vec<_>>()
                    );
                    pending.push(event);
                }
                Ok(Err(err)) => {
                    wlog!("recv err: {err:?}");
                    continue;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if pending.is_empty() || last_emit.elapsed() < Duration::from_millis(DEBOUNCE_MS) {
                continue;
            }

            let Some(state) = handle.state::<AppState>().get(&label) else {
                break;
            };

            if state.workspace_epoch.load(Ordering::SeqCst) != captured_epoch {
                pending.clear();
                last_emit = Instant::now();
                continue;
            }

            let mut rebuild_ignore = false;
            let root_for_filter = state.workspace_root.read().clone();

            for event in pending.drain(..) {
                for path in &event.paths {
                    if let Some(ref root) = root_for_filter {
                        if should_ignore(path, root) {
                            wlog!("filter[should_ignore]: {}", path.display());
                            continue;
                        }
                    }

                    if is_gitignore_path(path) {
                        wlog!("filter[gitignore-change]: {}", path.display());
                        rebuild_ignore = true;
                        continue;
                    }

                    let is_folder_event = matches!(
                        event.kind,
                        EventKind::Remove(notify::event::RemoveKind::Folder)
                    ) || matches!(
                        event.kind,
                        EventKind::Create(notify::event::CreateKind::Folder)
                    );
                    let is_dir = is_folder_event || path.is_dir();

                    if is_workspace_ignored(&state, path, is_dir) {
                        wlog!("filter[workspace_ignore]: {}", path.display());
                        continue;
                    }

                    let self_write = is_self_write(&state, path);

                    if !is_dir
                        && path.extension().and_then(|e| e.to_str()) == Some("md")
                        && path.exists()
                    {
                        state.update_index_modified_at(
                            path,
                            crate::commands::fs::modified_time(path),
                        );
                    }

                    let kind_str = match event_kind_str(&event.kind) {
                        Some(k) => k,
                        None => {
                            wlog!("filter[unmapped_kind]: {:?} {}", event.kind, path.display());
                            continue;
                        }
                    };

                    if self_write {
                        wlog!(
                            "self-write: suppressing content notify for {}",
                            path.display()
                        );
                    } else {
                        let payload = FileChangeEvent {
                            path: path.to_string_lossy().to_string(),
                            kind: kind_str.to_string(),
                        };

                        if is_dir {
                            wlog!(
                                "emit fs:directory-changed kind={kind_str} {}",
                                path.display()
                            );
                            let _ = handle.emit_to(label.clone(), "fs:directory-changed", &payload);
                        } else if is_config_file(path) {
                            wlog!("emit settings:changed {}", path.display());
                            if let Some(ref mut s) = *state.settings.write() {
                                s.reload_workspace();
                            }
                            let _ = handle.emit_to(label.clone(), "settings:changed", ());
                            continue;
                        } else {
                            wlog!("emit fs:file-changed kind={kind_str} {}", path.display());
                            let _ = handle.emit_to(label.clone(), "fs:file-changed", &payload);
                        }
                    }

                    let is_membership_change = matches!(
                        event.kind,
                        EventKind::Create(_)
                            | EventKind::Remove(_)
                            | EventKind::Modify(notify::event::ModifyKind::Name(_))
                    );
                    if !is_membership_change {
                        continue;
                    }

                    let is_md = path.extension().and_then(|e| e.to_str()) == Some("md");
                    let path_exists = path.exists();
                    if let Some(ref root) = root_for_filter {
                        if is_md {
                            if path_exists {
                                add_to_index(&state, path, root);
                            } else {
                                remove_from_index(&state, path, root);
                            }
                        } else if path_exists && is_dir {
                            add_subtree_to_index(&state, path, root);
                        } else if !path_exists {
                            remove_subtree_from_index(&state, path, root);
                        }
                    }

                    if !is_dir {
                        if let Some(parent) = path.parent() {
                            wlog!("emit fs:directory-changed (parent) {}", parent.display());
                            let _ = handle.emit_to(
                                label.clone(),
                                "fs:directory-changed",
                                &FileChangeEvent {
                                    path: parent.to_string_lossy().to_string(),
                                    kind: "modified".to_string(),
                                },
                            );
                        }
                    }
                }
            }

            if rebuild_ignore {
                if let Some(root) = state.workspace_root.read().clone() {
                    spawn_ignore_rebuild(handle.clone(), label.clone(), root, captured_epoch);
                }
            }

            last_emit = Instant::now();
        }
    });

    Ok(watcher)
}

pub fn start_file_watcher(
    app_handle: AppHandle,
    window_label: String,
    file: &Path,
    epoch: u64,
) -> Result<RecommendedWatcher, notify::Error> {
    let file_path = file.to_path_buf();
    let parent = file_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| notify::Error::generic("standalone file has no parent directory"))?;
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();

    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        notify::Config::default().with_poll_interval(Duration::from_millis(DEBOUNCE_MS)),
    )?;

    watcher.watch(&parent, RecursiveMode::NonRecursive)?;
    wlog!(
        "file watcher started for {} (watching {})",
        file_path.display(),
        parent.display()
    );

    let handle = app_handle;
    let label = window_label;
    std::thread::spawn(move || {
        let mut last_emit = Instant::now();
        let mut pending: Vec<Event> = Vec::new();

        loop {
            match rx.recv_timeout(Duration::from_millis(DEBOUNCE_MS)) {
                Ok(Ok(event)) => pending.push(event),
                Ok(Err(err)) => {
                    wlog!("file watcher recv err: {err:?}");
                    continue;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if pending.is_empty() || last_emit.elapsed() < Duration::from_millis(DEBOUNCE_MS) {
                continue;
            }

            let Some(state) = handle.state::<AppState>().get(&label) else {
                break;
            };

            if state.workspace_epoch.load(Ordering::SeqCst) != epoch {
                pending.clear();
                last_emit = Instant::now();
                continue;
            }

            for event in pending.drain(..) {
                let Some(kind_str) = event_kind_str(&event.kind) else {
                    continue;
                };
                for path in &event.paths {
                    if *path != file_path {
                        continue;
                    }
                    if is_self_write(&state, path) {
                        continue;
                    }
                    wlog!(
                        "emit fs:file-changed (standalone) kind={kind_str} {}",
                        path.display()
                    );
                    let _ = handle.emit_to(
                        label.clone(),
                        "fs:file-changed",
                        &FileChangeEvent {
                            path: path.to_string_lossy().to_string(),
                            kind: kind_str.to_string(),
                        },
                    );
                }
            }

            last_emit = Instant::now();
        }
    });

    Ok(watcher)
}

fn spawn_ignore_rebuild(
    handle: AppHandle,
    window_label: String,
    root: std::path::PathBuf,
    captured_epoch: u64,
) {
    std::thread::spawn(move || {
        let new_matcher = Arc::new(WorkspaceIgnore::load(&root));
        let Some(state) = handle.state::<AppState>().get(&window_label) else {
            return;
        };

        if state.workspace_epoch.load(Ordering::SeqCst) != captured_epoch {
            return;
        }
        *state.workspace_ignore.write() = Some(new_matcher);

        let _ = handle.emit_to(
            window_label,
            "fs:directory-changed",
            FileChangeEvent {
                path: root.to_string_lossy().to_string(),
                kind: "modified".to_string(),
            },
        );
    });
}

pub fn drop_watcher_off_thread(watcher: Option<RecommendedWatcher>) {
    let Some(watcher) = watcher else {
        return;
    };
    std::thread::spawn(move || drop(watcher));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const ROOT: &str = "/workspace";

    #[test]
    fn test_ignores_git_directory() {
        let root = Path::new(ROOT);
        assert!(should_ignore(Path::new("/workspace/.git/config"), root));
        assert!(should_ignore(
            Path::new("/workspace/.git/refs/heads/main"),
            root
        ));
    }

    #[test]
    fn test_ignores_hidden_files() {
        let root = Path::new(ROOT);
        assert!(should_ignore(Path::new("/workspace/.DS_Store"), root));
        assert!(should_ignore(Path::new("/workspace/.hidden/file.md"), root));
    }

    #[test]
    fn test_does_not_ignore_normal_files() {
        let root = Path::new(ROOT);
        assert!(!should_ignore(Path::new("/workspace/notes/hello.md"), root));
        assert!(!should_ignore(Path::new("/workspace/readme.md"), root));
    }

    #[test]
    fn dotdir_workspace_root_does_not_filter_its_own_paths() {
        let root = Path::new("/Users/joel/.notes");
        assert!(!should_ignore(&root.join("foo.md"), root));
        assert!(!should_ignore(&root.join("docs/bar.md"), root));
        assert!(should_ignore(&root.join(".cache/x"), root));
        assert!(should_ignore(&root.join(".git/HEAD"), root));
    }

    #[test]
    fn paths_outside_root_are_not_filtered_here() {
        let root = Path::new("/workspace");
        assert!(!should_ignore(Path::new("/elsewhere/.cache/file"), root));
    }

    #[test]
    fn test_self_write_detection() {
        let state = WorkspaceState::default();
        let path = PathBuf::from("/test/file.md");

        assert!(!is_self_write(&state, &path));
        record_write(&state, &path);

        assert!(is_self_write(&state, &path));
        assert!(is_self_write(&state, &path));
        assert!(is_self_write(&state, &path));
    }

    #[test]
    fn self_write_entry_is_not_consumed_on_match() {
        let state = WorkspaceState::default();
        let path = PathBuf::from("/test/file.md");

        record_write(&state, &path);
        assert!(is_self_write(&state, &path));
        assert_eq!(
            state.recent_writes.read().len(),
            1,
            "entry must survive the lookup so subsequent FSEvent fan-out is also suppressed"
        );
        assert!(is_self_write(&state, &path));
        assert_eq!(state.recent_writes.read().len(), 1);
    }

    #[test]
    fn self_write_expires_after_ttl() {
        let state = WorkspaceState::default();
        let path = PathBuf::from("/test/file.md");

        state.recent_writes.write().insert(
            path.clone(),
            Instant::now() - SELF_WRITE_TTL - Duration::from_millis(50),
        );

        assert!(!is_self_write(&state, &path));
    }

    #[test]
    fn add_to_index_is_idempotent() {
        let state = WorkspaceState::default();
        let root = PathBuf::from("/ws");
        let path = root.join("note.md");

        add_to_index(&state, &path, &root);
        add_to_index(&state, &path, &root);

        assert_eq!(state.file_index.read().len(), 1);
        assert!(state.dirs_with_markdown.read().contains(&root));
    }

    #[test]
    fn add_subtree_walks_real_directory_and_indexes_md_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let nested = root.join("nested");
        std::fs::create_dir_all(nested.join("deeper")).unwrap();
        std::fs::write(nested.join("a.md"), "# a").unwrap();
        std::fs::write(nested.join("deeper/b.md"), "# b").unwrap();
        std::fs::write(nested.join("ignored.txt"), "x").unwrap();

        let state = WorkspaceState::default();
        add_subtree_to_index(&state, &nested, &root);

        let paths: Vec<_> = state
            .file_index
            .read()
            .iter()
            .map(|f| f.path.clone())
            .collect();
        assert!(paths.contains(&nested.join("a.md")));
        assert!(paths.contains(&nested.join("deeper/b.md")));
        assert_eq!(paths.len(), 2, "non-md files must not be indexed");

        let dirs = state.dirs_with_markdown.read();
        assert!(dirs.contains(&nested));
        assert!(dirs.contains(&nested.join("deeper")));
        assert!(dirs.contains(&root), "ancestors register up to the root");
    }

    #[test]
    fn add_subtree_is_idempotent_against_existing_entries() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::write(root.join("a.md"), "# a").unwrap();

        let state = WorkspaceState::default();
        add_subtree_to_index(&state, &root, &root);
        add_subtree_to_index(&state, &root, &root);
        assert_eq!(state.file_index.read().len(), 1);
    }

    #[test]
    fn remove_subtree_drops_only_matching_descendants() {
        let state = WorkspaceState::default();
        let root = PathBuf::from("/ws");
        let kept = root.join("kept.md");
        let inside = root.join("sub/inside.md");
        let inside2 = root.join("sub/nested/x.md");
        let sibling = root.join("submarine/y.md");

        add_to_index(&state, &kept, &root);
        add_to_index(&state, &inside, &root);
        add_to_index(&state, &inside2, &root);
        add_to_index(&state, &sibling, &root);

        remove_subtree_from_index(&state, &root.join("sub"), &root);

        let paths: Vec<_> = state
            .file_index
            .read()
            .iter()
            .map(|f| f.path.clone())
            .collect();
        assert!(paths.contains(&kept));
        assert!(paths.contains(&sibling), "prefix-named sibling kept");
        assert!(!paths.contains(&inside), "direct child removed");
        assert!(!paths.contains(&inside2), "nested child removed");

        let dirs = state.dirs_with_markdown.read();
        assert!(dirs.contains(&root));
        assert!(dirs.contains(&root.join("submarine")));
        assert!(!dirs.contains(&root.join("sub")));
        assert!(!dirs.contains(&root.join("sub/nested")));
    }
}
