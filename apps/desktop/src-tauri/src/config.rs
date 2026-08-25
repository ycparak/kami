use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConfigValue {
    Bool(bool),
    Number(f64),
    String(String),
    List(Vec<String>),
}

impl ConfigValue {
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            ConfigValue::Bool(b) => Some(*b),
            _ => None,
        }
    }
}

fn value_to_string(value: &ConfigValue) -> String {
    match value {
        ConfigValue::Bool(b) => b.to_string(),
        ConfigValue::Number(n) => {
            if *n == (*n as i64) as f64 {
                (*n as i64).to_string()
            } else {
                n.to_string()
            }
        }
        ConfigValue::String(s) => s.clone(),
        ConfigValue::List(_) => String::new(),
    }
}

fn parse_value(s: &str) -> ConfigValue {
    let trimmed = s.trim();
    if trimmed.eq_ignore_ascii_case("true") {
        return ConfigValue::Bool(true);
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return ConfigValue::Bool(false);
    }
    if let Ok(n) = trimmed.parse::<f64>() {
        if n.is_finite() {
            return ConfigValue::Number(n);
        }
    }
    ConfigValue::String(trimmed.to_string())
}

pub fn parse_config(content: &str) -> HashMap<String, ConfigValue> {
    let mut map: HashMap<String, ConfigValue> = HashMap::new();
    let mut list_keys: HashMap<String, Vec<String>> = HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            let key = key.trim().to_string();
            let value_str = value.trim().to_string();

            if list_keys.contains_key(&key) {
                list_keys.get_mut(&key).unwrap().push(value_str);
            } else if map.contains_key(&key) {
                let first = match map.remove(&key).unwrap() {
                    ConfigValue::String(s) => s,
                    ConfigValue::Number(n) => {
                        if n == (n as i64) as f64 {
                            (n as i64).to_string()
                        } else {
                            n.to_string()
                        }
                    }
                    ConfigValue::Bool(b) => b.to_string(),
                    ConfigValue::List(l) => l.join(", "),
                };
                list_keys.insert(key, vec![first, value_str]);
            } else {
                map.insert(key, parse_value(&value_str));
            }
        }
    }

    for (key, values) in list_keys {
        map.insert(key, ConfigValue::List(values));
    }

    map
}

pub fn serialize_config(values: &HashMap<String, ConfigValue>, original: &str) -> String {
    let mut result = String::new();
    let mut written_keys: std::collections::HashSet<String> = std::collections::HashSet::new();

    for line in original.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            result.push_str(line);
            result.push('\n');
            continue;
        }
        if let Some((key, _)) = trimmed.split_once('=') {
            let key = key.trim().to_string();
            if written_keys.contains(&key) {
                continue;
            }
            if let Some(value) = values.get(&key) {
                match value {
                    ConfigValue::List(items) => {
                        for item in items {
                            result.push_str(&format!("{} = {}\n", key, item));
                        }
                    }
                    _ => {
                        result.push_str(&format!("{} = {}\n", key, value_to_string(value)));
                    }
                }
                written_keys.insert(key);
            }
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }

    for (key, value) in values {
        if !written_keys.contains(key) {
            match value {
                ConfigValue::List(items) => {
                    for item in items {
                        result.push_str(&format!("{} = {}\n", key, item));
                    }
                }
                _ => {
                    result.push_str(&format!("{} = {}\n", key, value_to_string(value)));
                }
            }
        }
    }

    result
}

pub fn remove_key_from_config(key: &str, original: &str) -> String {
    let mut result = String::new();
    for line in original.lines() {
        let trimmed = line.trim();
        if let Some((k, _)) = trimmed.split_once('=') {
            if k.trim() == key {
                continue;
            }
        }
        result.push_str(line);
        result.push('\n');
    }
    result
}

pub fn default_settings() -> HashMap<String, ConfigValue> {
    settings_schema()
        .into_iter()
        .map(|d| (d.key, d.default))
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingDef {
    pub key: String,
    pub label: String,
    pub description: String,
    pub category: String,
    #[serde(rename = "type")]
    pub value_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(rename = "cssVar", default, skip_serializing_if = "Option::is_none")]
    pub css_var: Option<String>,
    #[serde(rename = "cssFormat", default, skip_serializing_if = "Option::is_none")]
    pub css_format: Option<String>,
    pub default: ConfigValue,
}

#[derive(Debug, Deserialize)]
struct SettingsSchemaFile {
    settings: Vec<SettingDef>,
}

const SETTINGS_SCHEMA_JSON: &str = include_str!("../../shared/settings.schema.json");

fn load_schema() -> Vec<SettingDef> {
    let parsed: SettingsSchemaFile =
        serde_json::from_str(SETTINGS_SCHEMA_JSON).expect("settings.schema.json is malformed");
    parsed.settings
}

pub fn settings_schema() -> Vec<SettingDef> {
    load_schema()
}

pub struct Settings {
    defaults: HashMap<String, ConfigValue>,
    global: HashMap<String, ConfigValue>,
    workspace: HashMap<String, ConfigValue>,
    global_raw: String,
    workspace_raw: String,
    global_path: PathBuf,
    workspace_path: Option<PathBuf>,
}

impl Settings {
    pub fn new(global_config_dir: PathBuf) -> Self {
        let defaults = default_settings();
        let global_path = global_config_dir.join("config");

        let (global_raw, global) = if global_path.exists() {
            let raw = std::fs::read_to_string(&global_path).unwrap_or_default();
            let parsed = parse_config(&raw);
            (raw, parsed)
        } else {
            (String::new(), HashMap::new())
        };

        let mut settings = Self {
            defaults,
            global,
            workspace: HashMap::new(),
            global_raw,
            workspace_raw: String::new(),
            global_path,
            workspace_path: None,
        };

        settings.migrate_from_preferences(&global_config_dir);
        settings.migrate_theme_fonts();

        settings
    }

    fn migrate_theme_fonts(&mut self) {
        const FONT_SLOTS: [(&str, &str, &str); 3] = [
            ("fonts.ui", "theme.light.ui-font", "theme.dark.ui-font"),
            (
                "fonts.editor",
                "theme.light.editor-font",
                "theme.dark.editor-font",
            ),
            (
                "fonts.mono",
                "theme.light.mono-font",
                "theme.dark.mono-font",
            ),
        ];
        for (new_key, light_key, dark_key) in FONT_SLOTS {
            let old = self
                .global
                .get(light_key)
                .or_else(|| self.global.get(dark_key))
                .cloned();
            let Some(value) = old else {
                continue;
            };
            if !self.global.contains_key(new_key) {
                if let Err(error) = self.set_global(new_key, value) {
                    eprintln!("[config] failed to migrate {new_key}: {error}");
                    continue;
                }
            }
            for old_key in [light_key, dark_key] {
                if self.global.contains_key(old_key) {
                    if let Err(error) = self.reset_global(old_key) {
                        eprintln!("[config] failed to drop migrated {old_key}: {error}");
                    }
                }
            }
        }
    }

    fn migrate_from_preferences(&mut self, app_data_dir: &Path) {
        let prefs_path = app_data_dir.join("preferences.json");
        if !prefs_path.exists() {
            return;
        }
        if self.global.contains_key("appearance.theme") {
            let _ = std::fs::remove_file(&prefs_path);
            return;
        }
        if let Ok(data) = std::fs::read_to_string(&prefs_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(theme) = json.get("theme").and_then(|v| v.as_str()) {
                    let _ =
                        self.set_global("appearance.theme", ConfigValue::String(theme.to_string()));
                }
            }
        }
        let _ = std::fs::remove_file(&prefs_path);
    }

    pub fn load_workspace(&mut self, workspace_root: &Path) {
        let path = workspace_root.join(".kami").join("config");
        if path.exists() {
            let raw = std::fs::read_to_string(&path).unwrap_or_default();
            self.workspace = parse_config(&raw);
            self.workspace_raw = raw;
        } else {
            self.workspace = HashMap::new();
            self.workspace_raw = String::new();
        }
        self.workspace_path = Some(path);
    }

    pub fn get(&self, key: &str) -> Option<&ConfigValue> {
        self.workspace
            .get(key)
            .or_else(|| self.global.get(key))
            .or_else(|| self.defaults.get(key))
    }

    pub fn merged(&self) -> HashMap<String, ConfigValue> {
        let mut result = self.defaults.clone();
        for (k, v) in &self.global {
            result.insert(k.clone(), v.clone());
        }
        for (k, v) in &self.workspace {
            result.insert(k.clone(), v.clone());
        }
        result
    }

    pub fn set_global(&mut self, key: &str, value: ConfigValue) -> std::io::Result<()> {
        self.global.insert(key.to_string(), value.clone());
        let mut current = parse_config(&self.global_raw);
        current.insert(key.to_string(), value);
        self.global_raw = serialize_config(&current, &self.global_raw);
        if let Some(parent) = self.global_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.global_path, &self.global_raw)
    }

    pub fn set_workspace(&mut self, key: &str, value: ConfigValue) -> std::io::Result<()> {
        let ws_path = match &self.workspace_path {
            Some(p) => p.clone(),
            None => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "no workspace config path",
                ))
            }
        };
        self.workspace.insert(key.to_string(), value.clone());
        let mut current = parse_config(&self.workspace_raw);
        current.insert(key.to_string(), value);
        self.workspace_raw = serialize_config(&current, &self.workspace_raw);
        if let Some(parent) = ws_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&ws_path, &self.workspace_raw)
    }

    pub fn reset_global(&mut self, key: &str) -> std::io::Result<()> {
        self.global.remove(key);
        self.global_raw = remove_key_from_config(key, &self.global_raw);
        if let Some(parent) = self.global_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.global_path, &self.global_raw)
    }

    pub fn reset_workspace(&mut self, key: &str) -> std::io::Result<()> {
        let ws_path = match &self.workspace_path {
            Some(p) => p.clone(),
            None => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "no workspace config path",
                ))
            }
        };
        self.workspace.remove(key);
        self.workspace_raw = remove_key_from_config(key, &self.workspace_raw);
        std::fs::write(&ws_path, &self.workspace_raw)
    }

    pub fn reload_workspace(&mut self) {
        if let Some(ref path) = self.workspace_path {
            if path.exists() {
                self.workspace_raw = std::fs::read_to_string(path).unwrap_or_default();
                self.workspace = parse_config(&self.workspace_raw);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        let input = "key = value\nnumber = 42\nbool = true\n";
        let result = parse_config(input);
        assert_eq!(
            result.get("key"),
            Some(&ConfigValue::String("value".into()))
        );
        assert_eq!(result.get("number"), Some(&ConfigValue::Number(42.0)));
        assert_eq!(result.get("bool"), Some(&ConfigValue::Bool(true)));
    }

    #[test]
    fn test_parse_comments_and_blanks() {
        let input = "# comment\n\nkey = value\n# another comment\n";
        let result = parse_config(input);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result.get("key"),
            Some(&ConfigValue::String("value".into()))
        );
    }

    #[test]
    fn test_parse_dotted_keys() {
        let input = "editor.font-size = 16\nappearance.theme = dark\n";
        let result = parse_config(input);
        assert_eq!(
            result.get("editor.font-size"),
            Some(&ConfigValue::Number(16.0))
        );
        assert_eq!(
            result.get("appearance.theme"),
            Some(&ConfigValue::String("dark".into()))
        );
    }

    #[test]
    fn test_parse_list_values() {
        let input =
            "files.exclude = node_modules\nfiles.exclude = .DS_Store\nfiles.exclude = dist\n";
        let result = parse_config(input);
        assert_eq!(
            result.get("files.exclude"),
            Some(&ConfigValue::List(vec![
                "node_modules".into(),
                ".DS_Store".into(),
                "dist".into()
            ]))
        );
    }

    #[test]
    fn test_serialize_preserves_comments() {
        let original = "# My settings\ntheme = dark\n\n# Font settings\nfont-size = 14\n";
        let mut values = HashMap::new();
        values.insert("theme".into(), ConfigValue::String("light".into()));
        values.insert("font-size".into(), ConfigValue::Number(16.0));
        let result = serialize_config(&values, original);
        assert!(result.contains("# My settings"));
        assert!(result.contains("theme = light"));
        assert!(result.contains("# Font settings"));
        assert!(result.contains("font-size = 16"));
    }

    #[test]
    fn test_serialize_appends_new_keys() {
        let original = "theme = dark\n";
        let mut values = HashMap::new();
        values.insert("theme".into(), ConfigValue::String("dark".into()));
        values.insert("font-size".into(), ConfigValue::Number(14.0));
        let result = serialize_config(&values, original);
        assert!(result.contains("theme = dark"));
        assert!(result.contains("font-size = 14"));
    }

    #[test]
    fn test_remove_key() {
        let original = "theme = dark\nfont-size = 14\nline-height = 1.6\n";
        let result = remove_key_from_config("font-size", original);
        assert!(!result.contains("font-size"));
        assert!(result.contains("theme = dark"));
        assert!(result.contains("line-height = 1.6"));
    }

    #[test]
    fn test_roundtrip() {
        let input = "editor.font-size = 16\nappearance.theme = system\n";
        let parsed = parse_config(input);
        let serialized = serialize_config(&parsed, input);
        let reparsed = parse_config(&serialized);
        assert_eq!(parsed, reparsed);
    }

    #[test]
    fn test_settings_merge_order() {
        let dir = tempfile::tempdir().unwrap();
        let mut settings = Settings::new(dir.path().to_path_buf());

        assert_eq!(
            settings.get("editor.font-size"),
            Some(&ConfigValue::Number(16.0))
        );

        settings
            .set_global("editor.font-size", ConfigValue::Number(18.0))
            .unwrap();
        assert_eq!(
            settings.get("editor.font-size"),
            Some(&ConfigValue::Number(18.0))
        );
    }

    #[test]
    fn test_theme_font_migration() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config"),
            "theme.light.editor-font = Georgia, serif\n\
             theme.dark.editor-font = Iowan Old Style, serif\n\
             theme.dark.mono-font = Fira Code, monospace\n",
        )
        .unwrap();

        let settings = Settings::new(dir.path().to_path_buf());

        assert_eq!(
            settings.get("fonts.editor"),
            Some(&ConfigValue::String("Georgia, serif".into()))
        );
        assert_eq!(
            settings.get("fonts.mono"),
            Some(&ConfigValue::String("Fira Code, monospace".into()))
        );
        assert_eq!(settings.get("fonts.ui"), settings.defaults.get("fonts.ui"));

        let raw = std::fs::read_to_string(dir.path().join("config")).unwrap();
        assert!(!raw.contains("theme.light.editor-font"));
        assert!(!raw.contains("theme.dark.editor-font"));
        assert!(!raw.contains("theme.dark.mono-font"));
        assert!(settings.get("theme.light.editor-font").is_none());

        std::fs::write(
            dir.path().join("config"),
            "fonts.editor = Palatino, serif\ntheme.light.editor-font = Georgia, serif\n",
        )
        .unwrap();
        let settings = Settings::new(dir.path().to_path_buf());
        assert_eq!(
            settings.get("fonts.editor"),
            Some(&ConfigValue::String("Palatino, serif".into()))
        );
    }

    #[test]
    fn test_settings_workspace_override() {
        let dir = tempfile::tempdir().unwrap();
        let ws_dir = tempfile::tempdir().unwrap();
        let mut settings = Settings::new(dir.path().to_path_buf());

        settings
            .set_global("editor.font-size", ConfigValue::Number(18.0))
            .unwrap();
        settings.load_workspace(ws_dir.path());
        settings
            .set_workspace("editor.font-size", ConfigValue::Number(20.0))
            .unwrap();

        assert_eq!(
            settings.get("editor.font-size"),
            Some(&ConfigValue::Number(20.0))
        );
    }

    #[test]
    fn test_settings_reset() {
        let dir = tempfile::tempdir().unwrap();
        let mut settings = Settings::new(dir.path().to_path_buf());

        settings
            .set_global("editor.font-size", ConfigValue::Number(18.0))
            .unwrap();
        assert_eq!(
            settings.get("editor.font-size"),
            Some(&ConfigValue::Number(18.0))
        );

        settings.reset_global("editor.font-size").unwrap();
        assert_eq!(
            settings.get("editor.font-size"),
            Some(&ConfigValue::Number(16.0))
        );
    }

    #[test]
    fn test_value_with_equals_sign() {
        let input = "template = title: My Title\n";
        let result = parse_config(input);
        assert_eq!(
            result.get("template"),
            Some(&ConfigValue::String("title: My Title".into()))
        );
    }

    #[test]
    fn test_parse_false_value() {
        let input = "editor.spell-check = false\n";
        let result = parse_config(input);
        assert_eq!(
            result.get("editor.spell-check"),
            Some(&ConfigValue::Bool(false))
        );
    }

    #[test]
    fn test_parse_float() {
        let input = "editor.line-height = 1.6\n";
        let result = parse_config(input);
        assert_eq!(
            result.get("editor.line-height"),
            Some(&ConfigValue::Number(1.6))
        );
    }
}
