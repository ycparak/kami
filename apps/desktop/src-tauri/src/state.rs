use crate::config::Settings;
use crate::ignore::WorkspaceIgnore;
use crate::open_target::PendingOpenPayload;
use notify::RecommendedWatcher;
use parking_lot::{Mutex, RwLock};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

pub struct WorkspaceState {
    pub workspace_root: RwLock<Option<PathBuf>>,
    pub file_index: RwLock<Vec<IndexedFile>>,
    pub recent_files_cache: RwLock<Option<Vec<IndexedFile>>>,
    pub dirs_with_markdown: RwLock<HashSet<PathBuf>>,
    pub index_ready: AtomicBool,
    pub watcher_handle: RwLock<Option<RecommendedWatcher>>,
    pub recent_writes: RwLock<HashMap<PathBuf, Instant>>,
    pub workspace_ignore: RwLock<Option<Arc<WorkspaceIgnore>>>,
    pub workspace_epoch: AtomicU64,
    pub cancel_index: RwLock<Arc<AtomicBool>>,
    pub settings: RwLock<Option<Settings>>,
    pub startup_open: Mutex<Option<PendingOpenPayload>>,
    pub startup_open_taken: AtomicBool,
    pub pending_open: Mutex<VecDeque<PendingOpenPayload>>,
    pub standalone_file: RwLock<Option<PathBuf>>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct IndexedFile {
    pub path: PathBuf,
    pub relative_path: String,
    pub name: String,
    pub modified_at: u64,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            workspace_root: RwLock::new(None),
            file_index: RwLock::new(Vec::new()),
            recent_files_cache: RwLock::new(None),
            dirs_with_markdown: RwLock::new(HashSet::new()),
            index_ready: AtomicBool::new(false),
            watcher_handle: RwLock::new(None),
            recent_writes: RwLock::new(HashMap::new()),
            workspace_ignore: RwLock::new(None),
            workspace_epoch: AtomicU64::new(0),
            cancel_index: RwLock::new(Arc::new(AtomicBool::new(false))),
            settings: RwLock::new(None),
            startup_open: Mutex::new(None),
            startup_open_taken: AtomicBool::new(false),
            pending_open: Mutex::new(VecDeque::new()),
            standalone_file: RwLock::new(None),
        }
    }
}

impl WorkspaceState {
    pub fn set_startup_open(&self, payload: PendingOpenPayload) {
        debug_assert!(
            !self.startup_open_taken.load(Ordering::Acquire),
            "startup_open was set after get_startup_state consumed it"
        );
        *self.startup_open.lock() = Some(payload);
    }

    pub fn try_set_startup_open(
        &self,
        payload: PendingOpenPayload,
    ) -> Result<(), PendingOpenPayload> {
        let mut startup_open = self.startup_open.lock();
        if self.startup_open_taken.load(Ordering::Acquire) || startup_open.is_some() {
            return Err(payload);
        }
        *startup_open = Some(payload);
        Ok(())
    }

    pub fn take_startup_open(&self) -> Option<PendingOpenPayload> {
        let mut startup_open = self.startup_open.lock();
        let payload = startup_open.take();
        self.startup_open_taken.store(true, Ordering::Release);
        payload
    }

    pub fn push_pending_open(&self, payload: PendingOpenPayload) {
        let mut pending = self.pending_open.lock();
        if pending.back() == Some(&payload) {
            return;
        }
        pending.push_back(payload);
    }

    pub fn pop_pending_open(&self) -> Option<PendingOpenPayload> {
        self.pending_open.lock().pop_front()
    }

    pub fn invalidate_recent_files_cache(&self) {
        *self.recent_files_cache.write() = None;
    }

    pub fn recent_files_slice(&self, offset: usize, limit: usize) -> Vec<IndexedFile> {
        if self.recent_files_cache.read().is_none() {
            let mut files = self.file_index.read().clone();
            files.sort_by(|a, b| {
                b.modified_at
                    .cmp(&a.modified_at)
                    .then_with(|| a.relative_path.cmp(&b.relative_path))
            });
            *self.recent_files_cache.write() = Some(files);
        }

        self.recent_files_cache
            .read()
            .as_ref()
            .map(|files| files.iter().skip(offset).take(limit).cloned().collect())
            .unwrap_or_default()
    }

    pub fn update_index_modified_at(&self, path: &Path, modified_at: u64) {
        let mut changed = false;
        {
            let mut index = self.file_index.write();
            if let Some(file) = index.iter_mut().find(|file| file.path == path) {
                if file.modified_at != modified_at {
                    file.modified_at = modified_at;
                    changed = true;
                }
            }
        }

        if changed {
            self.invalidate_recent_files_cache();
        }
    }

    pub fn has_pending_workspace(&self, path: &Path) -> bool {
        let matches = |payload: &PendingOpenPayload| {
            payload
                .workspace
                .as_deref()
                .is_some_and(|workspace| Path::new(workspace) == path)
        };
        if self.startup_open.lock().as_ref().is_some_and(matches) {
            return true;
        }
        self.pending_open.lock().iter().any(matches)
    }

    pub fn has_pending_file(&self, path: &Path) -> bool {
        let matches = |payload: &PendingOpenPayload| {
            payload.workspace.is_none()
                && payload
                    .file
                    .as_deref()
                    .is_some_and(|file| Path::new(file) == path)
        };
        if self.startup_open.lock().as_ref().is_some_and(matches) {
            return true;
        }
        self.pending_open.lock().iter().any(matches)
    }
}

pub struct AppState {
    windows: RwLock<HashMap<String, Arc<WorkspaceState>>>,
    pub sessions_file_lock: Mutex<()>,
    pub recent_files_lock: Mutex<()>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            windows: RwLock::new(HashMap::new()),
            sessions_file_lock: Mutex::new(()),
            recent_files_lock: Mutex::new(()),
        }
    }

    pub fn get_or_create(&self, label: &str) -> Arc<WorkspaceState> {
        {
            let map = self.windows.read();
            if let Some(state) = map.get(label) {
                return state.clone();
            }
        }
        let mut map = self.windows.write();
        map.entry(label.to_string())
            .or_insert_with(|| Arc::new(WorkspaceState::default()))
            .clone()
    }

    pub fn get(&self, label: &str) -> Option<Arc<WorkspaceState>> {
        self.windows.read().get(label).cloned()
    }

    pub fn remove(&self, label: &str) -> Option<Arc<WorkspaceState>> {
        self.windows.write().remove(label)
    }

    pub fn find_by_workspace(&self, path: &Path) -> Option<String> {
        let map = self.windows.read();
        for (label, state) in map.iter() {
            let guard = state.workspace_root.read();
            if let Some(root) = guard.as_deref() {
                if root == path {
                    return Some(label.clone());
                }
            }
            drop(guard);

            if state.has_pending_workspace(path) {
                return Some(label.clone());
            }
        }
        None
    }

    pub fn find_by_standalone_file(&self, path: &Path) -> Option<String> {
        let map = self.windows.read();
        for (label, state) in map.iter() {
            let guard = state.standalone_file.read();
            if guard.as_deref() == Some(path) {
                return Some(label.clone());
            }
            drop(guard);

            if state.has_pending_file(path) {
                return Some(label.clone());
            }
        }
        None
    }

    pub fn labels(&self) -> Vec<String> {
        self.windows.read().keys().cloned().collect()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn register_ancestors(dirs: &mut HashSet<PathBuf>, file_path: &Path, root: &Path) {
    let mut dir = file_path.parent();
    while let Some(d) = dir {
        if !dirs.insert(d.to_path_buf()) {
            break;
        }
        if d == root {
            break;
        }
        dir = d.parent();
    }
}

pub fn rebuild_dirs_from_index(files: &[IndexedFile], root: &Path) -> HashSet<PathBuf> {
    let mut dirs = HashSet::with_capacity(files.len());
    for file in files {
        register_ancestors(&mut dirs, &file.path, root);
    }
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_by_workspace_matches_startup_open() {
        let app_state = AppState::new();
        let window_state = app_state.get_or_create("startup-window");
        window_state.set_startup_open(PendingOpenPayload {
            workspace: Some("/tmp/workspace".to_string()),
            file: None,
        });

        assert_eq!(
            app_state.find_by_workspace(Path::new("/tmp/workspace")),
            Some("startup-window".to_string())
        );
    }

    #[test]
    fn find_by_workspace_matches_pending_open() {
        let app_state = AppState::new();
        let window_state = app_state.get_or_create("pending-window");
        window_state.push_pending_open(PendingOpenPayload {
            workspace: Some("/tmp/workspace".to_string()),
            file: None,
        });

        assert_eq!(
            app_state.find_by_workspace(Path::new("/tmp/workspace")),
            Some("pending-window".to_string())
        );
    }

    #[test]
    fn find_by_standalone_file_matches_hosted_and_pending_files() {
        let app_state = AppState::new();
        let hosting = app_state.get_or_create("hosting-window");
        *hosting.standalone_file.write() = Some(PathBuf::from("/tmp/hosted.md"));

        let pending = app_state.get_or_create("pending-window");
        pending.set_startup_open(PendingOpenPayload {
            workspace: None,
            file: Some("/tmp/pending.md".to_string()),
        });

        assert_eq!(
            app_state.find_by_standalone_file(Path::new("/tmp/hosted.md")),
            Some("hosting-window".to_string())
        );
        assert_eq!(
            app_state.find_by_standalone_file(Path::new("/tmp/pending.md")),
            Some("pending-window".to_string())
        );
        assert_eq!(
            app_state.find_by_standalone_file(Path::new("/tmp/other.md")),
            None
        );
    }

    #[test]
    fn workspace_plus_file_payload_does_not_match_standalone_lookup() {
        let app_state = AppState::new();
        let state = app_state.get_or_create("workspace-window");
        state.push_pending_open(PendingOpenPayload {
            workspace: Some("/tmp/workspace".to_string()),
            file: Some("/tmp/workspace/a.md".to_string()),
        });

        assert_eq!(
            app_state.find_by_standalone_file(Path::new("/tmp/workspace/a.md")),
            None
        );
    }

    #[test]
    fn pending_open_preserves_distinct_payloads_in_order() {
        let window_state = WorkspaceState::default();
        let first = PendingOpenPayload {
            workspace: Some("/tmp/workspace-a".to_string()),
            file: Some("/tmp/workspace-a/a.md".to_string()),
        };
        let second = PendingOpenPayload {
            workspace: Some("/tmp/workspace-b".to_string()),
            file: Some("/tmp/workspace-b/b.md".to_string()),
        };

        window_state.push_pending_open(first.clone());
        window_state.push_pending_open(second.clone());

        assert_eq!(window_state.pop_pending_open(), Some(first));
        assert_eq!(window_state.pop_pending_open(), Some(second));
        assert_eq!(window_state.pop_pending_open(), None);
    }

    #[test]
    fn pending_open_dedupes_repeated_tail_payload() {
        let window_state = WorkspaceState::default();
        let payload = PendingOpenPayload {
            workspace: Some("/tmp/workspace".to_string()),
            file: Some("/tmp/workspace/a.md".to_string()),
        };

        window_state.push_pending_open(payload.clone());
        window_state.push_pending_open(payload.clone());

        assert_eq!(window_state.pop_pending_open(), Some(payload));
        assert_eq!(window_state.pop_pending_open(), None);
    }

    #[test]
    fn startup_open_cannot_be_seeded_after_take() {
        let window_state = WorkspaceState::default();
        assert_eq!(window_state.take_startup_open(), None);

        let payload = PendingOpenPayload {
            workspace: Some("/tmp/workspace".to_string()),
            file: None,
        };

        assert_eq!(
            window_state.try_set_startup_open(payload.clone()),
            Err(payload)
        );
    }

    #[test]
    fn startup_open_try_seed_preserves_existing_payload() {
        let window_state = WorkspaceState::default();
        let first = PendingOpenPayload {
            workspace: Some("/tmp/workspace-a".to_string()),
            file: None,
        };
        let second = PendingOpenPayload {
            workspace: Some("/tmp/workspace-b".to_string()),
            file: None,
        };

        window_state.set_startup_open(first.clone());

        assert_eq!(
            window_state.try_set_startup_open(second.clone()),
            Err(second)
        );
        assert_eq!(window_state.take_startup_open(), Some(first));
    }
}
