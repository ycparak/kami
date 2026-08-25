use crate::commands::fs::{read_file_impl, FileContent};
use crate::commands::settings::config_value_to_json;
use crate::commands::workspace::{
    build_restore_bundle, load_recent_workspaces, watch_standalone_file_impl,
    RestoreWorkspaceResponse,
};
use crate::error::AppError;
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri::Manager;

const RESTORE_WORKSPACE_KEY: &str = "window.restore-workspace";

#[derive(Debug, Serialize)]
pub struct StartupState {
    pub settings: Value,
    pub recent_workspaces: Vec<String>,
    pub restore_bundle: Option<RestoreWorkspaceResponse>,
    pub standalone_file: Option<FileContent>,
}

#[tauri::command]
pub async fn get_startup_state(
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<StartupState, AppError> {
    let label = webview.label().to_string();
    let state = app.state::<AppState>().get_or_create(&label);

    let (settings, restore_enabled) = {
        let guard = state.settings.read();
        match guard.as_ref() {
            Some(s) => {
                let merged = s.merged();
                let restore_enabled = merged
                    .get(RESTORE_WORKSPACE_KEY)
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let mut obj = serde_json::Map::new();
                for (k, v) in &merged {
                    obj.insert(k.clone(), config_value_to_json(v));
                }
                (Value::Object(obj), restore_enabled)
            }
            None => return Err(AppError::Io("Settings not initialized".into())),
        }
    };

    let recent_workspaces = load_recent_workspaces(&app).unwrap_or_default();
    let startup_open = state.take_startup_open();

    if let Some(payload) = &startup_open {
        if payload.workspace.is_none() {
            if let Some(file) = &payload.file {
                let standalone_file = match read_file_impl(file) {
                    Ok(content) => Some(content),
                    Err(err) => {
                        eprintln!("failed to read standalone startup file {file}: {err:?}");
                        None
                    }
                };
                if standalone_file.is_some() {
                    if let Err(err) = watch_standalone_file_impl(&app, &label, file) {
                        eprintln!("failed to start standalone file watcher: {err:?}");
                    }
                }
                return Ok(StartupState {
                    settings,
                    recent_workspaces,
                    restore_bundle: None,
                    standalone_file,
                });
            }
        }
    }

    let restore_target = if let Some(payload) = &startup_open {
        payload.workspace.clone()
    } else if restore_enabled {
        recent_workspaces
            .first()
            .filter(|path| Path::new(path).is_dir())
            .cloned()
    } else {
        None
    };

    let mut restore_bundle = if let Some(path) = restore_target {
        match build_restore_bundle(&app, &label, &path).await {
            Ok(bundle) => Some(bundle),
            Err(err) => {
                eprintln!("failed to prefetch restore bundle for {path}: {err:?}");
                None
            }
        }
    } else {
        None
    };

    if let Some(pending) = startup_open {
        if pending.workspace.is_some() {
            if let Some(ref mut bundle) = restore_bundle {
                bundle.session = None;
                bundle.active_file = None;
                bundle.open_file = pending.file;
            }
        }
    }

    Ok(StartupState {
        settings,
        recent_workspaces,
        restore_bundle,
        standalone_file: None,
    })
}
