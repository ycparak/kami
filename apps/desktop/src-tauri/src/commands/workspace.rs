use crate::commands::fs::{read_directory_impl, read_file_impl, DirEntry, FileContent};
use crate::commands::search::index_workspace_impl;
use crate::error::AppError;
use crate::ignore::WorkspaceIgnore;
use crate::state::{AppState, WorkspaceState};
use crate::watcher::drop_watcher_off_thread;
use crate::PendingOpenPayload;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceInfo {
    pub root: String,
    pub name: String,
    pub file_count: usize,
}

pub(crate) fn canonicalize_workspace_root(path: &str) -> Result<PathBuf, AppError> {
    let raw_root = PathBuf::from(path);
    if !raw_root.exists() || !raw_root.is_dir() {
        return Err(AppError::NotFound(path.to_string()));
    }
    raw_root
        .canonicalize()
        .map_err(|e| AppError::Io(e.to_string()))
}

fn prepare_workspace_state(
    app: &tauri::AppHandle,
    label: &str,
    path: &str,
) -> Result<WorkspaceInfo, AppError> {
    let root = canonicalize_workspace_root(path)?;
    let canonical_path = root.to_string_lossy().to_string();

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical_path.clone());

    let state = app.state::<AppState>().get_or_create(label);

    let new_epoch = state.workspace_epoch.fetch_add(1, Ordering::SeqCst) + 1;

    let new_cancel = {
        let mut guard = state.cancel_index.write();
        guard.store(true, Ordering::SeqCst);
        let fresh = Arc::new(AtomicBool::new(false));
        *guard = Arc::clone(&fresh);
        fresh
    };

    *state.workspace_root.write() = Some(root.clone());
    *state.standalone_file.write() = None;
    *state.file_index.write() = Vec::new();
    state.invalidate_recent_files_cache();
    *state.dirs_with_markdown.write() = Default::default();
    state.index_ready.store(false, Ordering::Relaxed);

    *state.workspace_ignore.write() = Some(Arc::new(WorkspaceIgnore::bootstrap()));

    let old_watcher = state.watcher_handle.write().take();
    drop_watcher_off_thread(old_watcher);

    if let Some(settings) = state.settings.write().as_mut() {
        settings.load_workspace(&root);
    }

    let _ = save_recent_workspace(app, &canonical_path);

    let handle = app.clone();
    let root_for_bg = root.clone();
    let label_for_bg = label.to_string();
    std::thread::spawn(move || {
        run_workspace_bootstrap(handle, label_for_bg, root_for_bg, new_epoch, new_cancel);
    });

    Ok(WorkspaceInfo {
        root: canonical_path,
        name,
        file_count: 0,
    })
}

fn run_workspace_bootstrap(
    handle: tauri::AppHandle,
    label: String,
    root: PathBuf,
    epoch: u64,
    cancel: Arc<AtomicBool>,
) {
    let Some(state) = handle.state::<AppState>().get(&label) else {
        return;
    };

    if !epoch_is_current(&state, epoch) {
        return;
    }

    match crate::watcher::start_watcher(handle.clone(), label.clone(), &root, epoch) {
        Ok(watcher) => {
            let mut guard = state.watcher_handle.write();
            if !epoch_is_current(&state, epoch) {
                drop(watcher);
                return;
            }
            *guard = Some(watcher);
        }
        Err(e) => {
            eprintln!("Failed to start file watcher: {}", e);
        }
    }

    let new_ignore = Arc::new(WorkspaceIgnore::load(&root));
    {
        if !epoch_is_current(&state, epoch) {
            return;
        }
        *state.workspace_ignore.write() = Some(new_ignore);
    }

    let _ = handle.emit_to(
        label.clone(),
        "fs:directory-changed",
        crate::watcher::FileChangeEvent {
            path: root.to_string_lossy().to_string(),
            kind: "modified".to_string(),
        },
    );

    let (indexed, dirs) = index_workspace_impl(&root, Arc::clone(&cancel));
    if cancel.load(Ordering::Relaxed) {
        return;
    }
    let file_count = indexed.len();

    if !epoch_is_current(&state, epoch) {
        return;
    }
    *state.file_index.write() = indexed;
    state.invalidate_recent_files_cache();
    *state.dirs_with_markdown.write() = dirs;
    state.index_ready.store(true, Ordering::Relaxed);

    let _ = handle.emit_to(label, "index:complete", file_count);
}

fn epoch_is_current(state: &WorkspaceState, captured: u64) -> bool {
    state.workspace_epoch.load(Ordering::SeqCst) == captured
}

#[tauri::command]
pub fn open_workspace(
    path: String,
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<WorkspaceInfo, AppError> {
    prepare_workspace_state(&app, webview.label(), &path)
}

#[derive(Debug, Serialize)]
pub struct RestoreWorkspaceResponse {
    pub workspace: WorkspaceInfo,
    pub entries: Vec<DirEntry>,
    pub recent_workspaces: Vec<String>,
    pub session: Option<SessionData>,
    pub active_file: Option<FileContent>,
    pub open_file: Option<String>,
}

pub(crate) async fn build_restore_bundle(
    app: &tauri::AppHandle,
    label: &str,
    path: &str,
) -> Result<RestoreWorkspaceResponse, AppError> {
    let workspace = prepare_workspace_state(app, label, path)?;

    let canonical_root = workspace.root.clone();

    let entries_handle = {
        let app = app.clone();
        let root = canonical_root.clone();
        let label = label.to_string();
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<AppState>().get_or_create(&label);
            read_directory_impl(&root, Some(&state))
        })
    };
    let recents_handle = {
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            load_recent_workspaces(&app).unwrap_or_default()
        })
    };
    let session_handle = {
        let app = app.clone();
        let root = canonical_root.clone();
        tauri::async_runtime::spawn_blocking(move || load_session_impl(&app, &root))
    };

    let entries = entries_handle
        .await
        .map_err(|e| AppError::Io(e.to_string()))??;
    let recent_workspaces = recents_handle
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    let session = session_handle
        .await
        .map_err(|e| AppError::Io(e.to_string()))??;

    let active_file = if let Some(active_path) = active_session_path(session.as_ref()) {
        tauri::async_runtime::spawn_blocking(move || read_file_impl(&active_path).ok())
            .await
            .map_err(|e| AppError::Io(e.to_string()))?
    } else {
        None
    };

    Ok(RestoreWorkspaceResponse {
        workspace,
        entries,
        recent_workspaces,
        session,
        active_file,
        open_file: None,
    })
}

fn active_session_path(session: Option<&SessionData>) -> Option<String> {
    let session = session?;
    let idx = session.active_index?;
    let tab = session.tabs.get(idx)?;
    if tab.location.kind != "file" {
        return None;
    }
    tab.location
        .payload
        .get("path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn get_recent_workspaces(app: tauri::AppHandle) -> Vec<String> {
    load_recent_workspaces(&app).unwrap_or_default()
}

#[tauri::command]
pub fn remove_recent_workspace(path: String, app: tauri::AppHandle) -> Result<(), AppError> {
    let mut recents = load_recent_workspaces(&app).unwrap_or_default();
    recents.retain(|p| p != &path);
    save_recent_workspaces_list(&app, &recents)
}

fn recent_workspaces_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("recent_workspaces.json"))
}

pub(crate) fn load_recent_workspaces(app: &tauri::AppHandle) -> Result<Vec<String>, AppError> {
    let path = recent_workspaces_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path)?;
    serde_json::from_str(&data).map_err(|e| AppError::Io(e.to_string()))
}

fn save_recent_workspace(app: &tauri::AppHandle, workspace_path: &str) -> Result<(), AppError> {
    let mut recents = load_recent_workspaces(app).unwrap_or_default();
    recents.retain(|p| p != workspace_path);
    recents.insert(0, workspace_path.to_string());
    recents.truncate(10);
    save_recent_workspaces_list(app, &recents)
}

fn save_recent_workspaces_list(app: &tauri::AppHandle, recents: &[String]) -> Result<(), AppError> {
    let path = recent_workspaces_path(app)?;
    let data = serde_json::to_string_pretty(recents).map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::write(&path, data)?;
    Ok(())
}

#[tauri::command]
pub fn take_pending_open(
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Option<PendingOpenPayload> {
    let state = app.state::<AppState>().get_or_create(webview.label());
    state.pop_pending_open()
}

#[tauri::command]
pub fn open_workspace_in_new_window(
    path: String,
    file: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let workspace = PathBuf::from(&path);
    if !workspace.exists() || !workspace.is_dir() {
        return Err(AppError::NotFound(path.clone()));
    }

    crate::open_new_workspace_window(&app, path, file)
}

#[tauri::command]
pub fn open_file_in_standalone_window(path: String, app: tauri::AppHandle) -> Result<(), AppError> {
    crate::open_standalone_file_window(&app, path)
}

pub(crate) fn watch_standalone_file_impl(
    app: &tauri::AppHandle,
    label: &str,
    path: &str,
) -> Result<(), AppError> {
    let raw = PathBuf::from(path);
    if !raw.is_file() {
        return Err(AppError::NotFound(path.to_string()));
    }
    let file = raw
        .canonicalize()
        .map_err(|e| AppError::Io(e.to_string()))?;

    let state = app.state::<AppState>().get_or_create(label);
    let epoch = state.workspace_epoch.fetch_add(1, Ordering::SeqCst) + 1;
    *state.standalone_file.write() = Some(file.clone());

    let old_watcher = state.watcher_handle.write().take();
    drop_watcher_off_thread(old_watcher);

    let watcher = crate::watcher::start_file_watcher(app.clone(), label.to_string(), &file, epoch)
        .map_err(|e| AppError::Io(e.to_string()))?;

    let mut guard = state.watcher_handle.write();
    if epoch_is_current(&state, epoch) {
        *guard = Some(watcher);
    }
    Ok(())
}

#[tauri::command]
pub fn watch_standalone_file(
    path: String,
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    watch_standalone_file_impl(&app, webview.label(), &path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedLocation {
    pub kind: String,
    #[serde(flatten)]
    pub payload: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTab {
    pub location: SerializedLocation,
    #[serde(default)]
    pub back: Vec<SerializedLocation>,
    #[serde(default)]
    pub forward: Vec<SerializedLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    #[serde(default)]
    pub tabs: Vec<SessionTab>,
    #[serde(default)]
    pub active_index: Option<usize>,
}

fn sessions_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("sessions.json"))
}

fn load_all_sessions(app: &tauri::AppHandle) -> HashMap<String, SessionData> {
    let path = match sessions_path(app) {
        Ok(p) => p,
        Err(_) => return HashMap::new(),
    };
    if !path.exists() {
        return HashMap::new();
    }
    let data = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn save_all_sessions(
    app: &tauri::AppHandle,
    sessions: &HashMap<String, SessionData>,
) -> Result<(), AppError> {
    let path = sessions_path(app)?;
    let data = serde_json::to_string_pretty(sessions).map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::write(&path, data)?;
    Ok(())
}

#[tauri::command]
pub fn save_session(
    workspace_root: String,
    tabs: Vec<SessionTab>,
    active_index: Option<usize>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let key = workspace_root.trim_end_matches('/').to_string();
    let state = app.state::<AppState>();
    let _guard = state.sessions_file_lock.lock();
    let mut sessions = load_all_sessions(&app);

    if tabs.is_empty() && active_index.is_none() {
        sessions.remove(&key);
    } else {
        sessions.insert(key, SessionData { tabs, active_index });
    }

    save_all_sessions(&app, &sessions)
}

pub(crate) fn load_session_impl(
    app: &tauri::AppHandle,
    workspace_root: &str,
) -> Result<Option<SessionData>, AppError> {
    let key = workspace_root.trim_end_matches('/').to_string();
    let sessions = load_all_sessions(app);
    Ok(sessions.get(&key).cloned())
}

#[tauri::command]
pub fn load_session(
    workspace_root: String,
    app: tauri::AppHandle,
) -> Result<Option<SessionData>, AppError> {
    load_session_impl(&app, &workspace_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn canonicalize_rejects_missing_path() {
        let err = canonicalize_workspace_root("/this/path/does/not/exist/ever").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn canonicalize_rejects_non_directory() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a-file.md");
        std::fs::write(&file, "x").unwrap();
        let err = canonicalize_workspace_root(file.to_str().unwrap()).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn canonicalize_round_trips_existing_directory() {
        let dir = TempDir::new().unwrap();
        let raw = dir.path().to_string_lossy().to_string();
        let canonical = canonicalize_workspace_root(&raw).unwrap();
        assert!(canonical.is_absolute());
        assert_eq!(canonical, std::fs::canonicalize(&raw).unwrap());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn canonicalize_resolves_var_alias_on_macos() {
        let dir = TempDir::new().unwrap();
        let raw = dir.path().to_string_lossy().to_string();
        if let Some(stripped) = raw.strip_prefix("/private") {
            let aliased = stripped.to_string();
            assert!(std::path::Path::new(&aliased).exists());
            let canonical = canonicalize_workspace_root(&aliased).unwrap();
            assert_eq!(
                canonical.to_string_lossy(),
                raw,
                "aliased input must canonicalize back to the /private/... form"
            );
        }
    }
}
