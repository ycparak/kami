use crate::config::{ConfigValue, Settings};
use crate::error::AppError;
use crate::state::{AppState, WorkspaceState};
use serde_json::Value;
use std::sync::Arc;
use tauri::Manager;

fn with_settings<T>(
    app: &tauri::AppHandle,
    label: &str,
    f: impl FnOnce(&Settings) -> T,
) -> Result<T, AppError> {
    let state = app.state::<AppState>().get_or_create(label);
    let guard = state.settings.read();
    match guard.as_ref() {
        Some(s) => Ok(f(s)),
        None => Err(AppError::Io("Settings not initialized".into())),
    }
}

fn with_settings_mut<T>(
    app: &tauri::AppHandle,
    label: &str,
    f: impl FnOnce(&mut Settings) -> T,
) -> Result<T, AppError> {
    let state = app.state::<AppState>().get_or_create(label);
    let mut guard = state.settings.write();
    match guard.as_mut() {
        Some(s) => Ok(f(s)),
        None => Err(AppError::Io("Settings not initialized".into())),
    }
}

pub fn init_window_settings(app: &tauri::AppHandle, state: &Arc<WorkspaceState>) {
    let config_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    *state.settings.write() = Some(Settings::new(config_dir));
}

pub fn config_value_to_json(v: &ConfigValue) -> Value {
    match v {
        ConfigValue::Bool(b) => Value::Bool(*b),
        ConfigValue::Number(n) => serde_json::Number::from_f64(*n)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ConfigValue::String(s) => Value::String(s.clone()),
        ConfigValue::List(items) => {
            Value::Array(items.iter().map(|s| Value::String(s.clone())).collect())
        }
    }
}

fn json_to_config_value(v: &Value) -> Option<ConfigValue> {
    match v {
        Value::Bool(b) => Some(ConfigValue::Bool(*b)),
        Value::Number(n) => n.as_f64().map(ConfigValue::Number),
        Value::String(s) => Some(ConfigValue::String(s.clone())),
        Value::Array(arr) => {
            let items: Vec<String> = arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            Some(ConfigValue::List(items))
        }
        _ => None,
    }
}

#[tauri::command]
pub fn get_settings(webview: tauri::Webview, app: tauri::AppHandle) -> Result<Value, AppError> {
    with_settings(&app, webview.label(), |settings| {
        let merged = settings.merged();
        let mut obj = serde_json::Map::new();
        for (k, v) in &merged {
            obj.insert(k.clone(), config_value_to_json(v));
        }
        Value::Object(obj)
    })
}

#[tauri::command]
pub fn get_setting(
    key: String,
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<Value, AppError> {
    with_settings(&app, webview.label(), |settings| {
        settings
            .get(&key)
            .map(config_value_to_json)
            .unwrap_or(Value::Null)
    })
}

#[tauri::command]
pub fn set_setting(
    key: String,
    value: Value,
    scope: String,
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let config_value =
        json_to_config_value(&value).ok_or_else(|| AppError::Io("Invalid value type".into()))?;

    with_settings_mut(&app, webview.label(), |settings| {
        let result = match scope.as_str() {
            "workspace" => settings.set_workspace(&key, config_value),
            _ => settings.set_global(&key, config_value),
        };
        result.map_err(|e| AppError::Io(e.to_string()))
    })?
}

#[tauri::command]
pub fn reset_setting(
    key: String,
    scope: String,
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    with_settings_mut(&app, webview.label(), |settings| {
        let result = match scope.as_str() {
            "workspace" => settings.reset_workspace(&key),
            _ => settings.reset_global(&key),
        };
        result.map_err(|e| AppError::Io(e.to_string()))
    })?
}
