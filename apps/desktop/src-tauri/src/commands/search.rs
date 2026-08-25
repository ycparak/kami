use crate::error::AppError;
use crate::state::{self, AppState, IndexedFile};
use ignore::WalkBuilder;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub relative_path: String,
    pub score: u32,
    pub match_indices: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IndexStats {
    pub file_count: usize,
    pub duration_ms: u64,
}

#[tauri::command]
pub fn index_workspace(
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<IndexStats, AppError> {
    let state = app.state::<AppState>().get_or_create(webview.label());
    let root = state
        .workspace_root
        .read()
        .clone()
        .ok_or(AppError::NoWorkspace)?;
    let cancel = Arc::clone(&state.cancel_index.read());
    let epoch = state.workspace_epoch.load(Ordering::SeqCst);

    let start = std::time::Instant::now();
    let (indexed, dirs) = index_workspace_impl(&root, cancel);
    let file_count = indexed.len();
    let duration_ms = start.elapsed().as_millis() as u64;

    if state.workspace_epoch.load(Ordering::SeqCst) != epoch {
        return Ok(IndexStats {
            file_count: 0,
            duration_ms,
        });
    }

    *state.file_index.write() = indexed;
    state.invalidate_recent_files_cache();
    *state.dirs_with_markdown.write() = dirs;
    state.index_ready.store(true, Ordering::Relaxed);

    Ok(IndexStats {
        file_count,
        duration_ms,
    })
}

#[tauri::command]
pub fn fuzzy_search(
    query: String,
    limit: Option<u32>,
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<Vec<SearchResult>, AppError> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let state = app.state::<AppState>().get_or_create(webview.label());
    let limit = limit.unwrap_or(50) as usize;
    let index = state.file_index.read();
    fuzzy_search_from(&query, &index, limit)
}

fn fuzzy_search_from(
    query: &str,
    index: &[IndexedFile],
    limit: usize,
) -> Result<Vec<SearchResult>, AppError> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let normalized_query = query.to_lowercase();
    let mut needles = Vec::from([normalized_query.clone()]);
    let hyphen_query = normalized_query.replace(' ', "-");
    if !needles.contains(&hyphen_query) {
        needles.push(hyphen_query);
    }
    let space_query = normalized_query.replace('-', " ");
    if !needles.contains(&space_query) {
        needles.push(space_query);
    }

    let mut results: Vec<SearchResult> = index
        .iter()
        .filter_map(|file| {
            let haystack = file.relative_path.to_lowercase();
            let (byte_start, needle) = needles
                .iter()
                .filter_map(|needle| haystack.find(needle).map(|start| (start, needle)))
                .min_by_key(|(start, _)| *start)?;

            let char_start = haystack[..byte_start].chars().count();
            let char_len = needle.chars().count();

            let filename_start_bytes = file.relative_path.rfind('/').map(|i| i + 1).unwrap_or(0);
            let in_filename = byte_start >= filename_start_bytes;

            let mut score: u32 = 0;
            if in_filename {
                score += 1_000_000;
            }
            score += 10_000u32.saturating_sub(byte_start as u32);
            score +=
                1_000u32.saturating_sub((file.relative_path.chars().count() as u32).min(1_000));

            let match_indices: Vec<u32> = (char_start..char_start + char_len)
                .map(|i| i as u32)
                .collect();

            Some(SearchResult {
                path: file.path.to_string_lossy().to_string(),
                filename: file.name.clone(),
                relative_path: file.relative_path.clone(),
                score,
                match_indices,
            })
        })
        .collect();

    results.sort_by(|a, b| b.score.cmp(&a.score));
    results.truncate(limit);
    Ok(results)
}

pub fn index_workspace_impl(
    root: &Path,
    cancel: Arc<AtomicBool>,
) -> (Vec<IndexedFile>, HashSet<PathBuf>) {
    let root = root.to_path_buf();
    let results: Arc<Mutex<Vec<IndexedFile>>> = Arc::new(Mutex::new(Vec::new()));

    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4);

    let results_ref = Arc::clone(&results);
    let root_ref = root.clone();

    WalkBuilder::new(&root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .threads(threads)
        .build_parallel()
        .run(move || {
            let results = Arc::clone(&results_ref);
            let root = root_ref.clone();
            let cancel = Arc::clone(&cancel);
            Box::new(move |entry| {
                if cancel.load(Ordering::Relaxed) {
                    return ignore::WalkState::Quit;
                }
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => return ignore::WalkState::Continue,
                };
                if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                    if entry.file_name() == "node_modules" {
                        return ignore::WalkState::Skip;
                    }
                    return ignore::WalkState::Continue;
                }
                if entry.file_type().is_some_and(|ft| ft.is_file())
                    && entry.path().extension().and_then(|e| e.to_str()) == Some("md")
                {
                    let rel = entry
                        .path()
                        .strip_prefix(&root)
                        .unwrap_or(entry.path())
                        .to_string_lossy()
                        .to_string();
                    results.lock().push(IndexedFile {
                        path: entry.path().to_path_buf(),
                        relative_path: rel,
                        name: entry.file_name().to_string_lossy().to_string(),
                        modified_at: crate::commands::fs::modified_time(entry.path()),
                    });
                }
                ignore::WalkState::Continue
            })
        });

    let indexed = Arc::try_unwrap(results).unwrap().into_inner();
    let dirs = state::rebuild_dirs_from_index(&indexed, &root);
    (indexed, dirs)
}

#[cfg(test)]
fn index_workspace_test(root: &Path) -> (Vec<IndexedFile>, HashSet<PathBuf>) {
    index_workspace_impl(root, Arc::new(AtomicBool::new(false)))
}

#[cfg(test)]
fn fuzzy_search_impl(query: &str, index: &[IndexedFile], limit: usize) -> Vec<SearchResult> {
    fuzzy_search_from(query, index, limit).unwrap_or_default()
}

pub fn find_file_by_name_impl(root: &Path, file_name: &str) -> Option<PathBuf> {
    let matches: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));
    let target = file_name.to_lowercase();

    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4);

    let matches_ref = Arc::clone(&matches);
    WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .threads(threads)
        .build_parallel()
        .run(move || {
            let matches = Arc::clone(&matches_ref);
            let target = target.clone();
            Box::new(move |entry| {
                let Ok(entry) = entry else {
                    return ignore::WalkState::Continue;
                };
                if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                    if entry.file_name() == "node_modules" {
                        return ignore::WalkState::Skip;
                    }
                    return ignore::WalkState::Continue;
                }
                if entry.file_type().is_some_and(|ft| ft.is_file())
                    && entry.file_name().to_string_lossy().to_lowercase() == target
                {
                    matches.lock().push(entry.path().to_path_buf());
                }
                ignore::WalkState::Continue
            })
        });

    let mut matches = Arc::try_unwrap(matches).unwrap().into_inner();
    matches.sort_by(|a, b| {
        let depth_a = a.components().count();
        let depth_b = b.components().count();
        depth_a.cmp(&depth_b).then_with(|| a.cmp(b))
    });
    matches.into_iter().next()
}

#[tauri::command]
pub async fn find_file_by_name(
    root: String,
    file_name: String,
) -> Result<Option<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(find_file_by_name_impl(Path::new(&root), &file_name)
            .map(|path| path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_workspace() -> TempDir {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("readme.md"), "# Readme").unwrap();
        fs::write(dir.path().join("notes.md"), "# Notes").unwrap();
        fs::write(dir.path().join("data.txt"), "not indexed").unwrap();
        fs::create_dir(dir.path().join("docs")).unwrap();
        fs::write(dir.path().join("docs").join("guide.md"), "# Guide").unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git").join("config.md"), "git").unwrap();
        dir
    }

    #[test]
    fn test_index_workspace_counts_md_files() {
        let dir = setup_workspace();
        let (index, _dirs) = index_workspace_test(dir.path());
        assert_eq!(index.len(), 3);
    }

    #[test]
    fn test_index_workspace_ignores_hidden() {
        let dir = setup_workspace();
        let (index, _dirs) = index_workspace_test(dir.path());
        assert!(!index.iter().any(|f| f.relative_path.contains(".git")));
    }

    #[test]
    fn test_index_workspace_builds_dirs_with_markdown() {
        let dir = setup_workspace();
        let root = dir.path().to_path_buf();
        let (_index, dirs) = index_workspace_test(dir.path());
        assert!(dirs.contains(&root));
        assert!(dirs.contains(&root.join("docs")));
        assert!(!dirs.contains(&root.join(".git")));
    }

    #[test]
    fn test_cancel_flag_short_circuits_walk() {
        let dir = setup_workspace();
        let cancel = Arc::new(AtomicBool::new(true));
        let (index, dirs) = index_workspace_impl(dir.path(), cancel);
        assert!(index.is_empty());
        assert!(dirs.is_empty());
    }

    #[test]
    fn test_live_cancel_token_survives_after_swap() {
        let live = Arc::new(AtomicBool::new(false));
        let walker_view = Arc::clone(&live);
        live.store(true, Ordering::Relaxed);
        let _fresh = Arc::new(AtomicBool::new(false));
        assert!(walker_view.load(Ordering::Relaxed));
    }

    #[test]
    fn test_fuzzy_search_ranks_by_relevance() {
        let dir = setup_workspace();
        let (index, _dirs) = index_workspace_test(dir.path());
        let results = fuzzy_search_impl("readme", &index, 50);
        assert!(!results.is_empty());
        assert_eq!(results[0].filename, "readme.md");
    }

    #[test]
    fn test_fuzzy_search_matches_space_separated_names() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("No prior experience.md"), "# Note").unwrap();
        let (index, _dirs) = index_workspace_test(dir.path());

        let results = fuzzy_search_impl("No prior experience", &index, 50);

        assert!(!results.is_empty());
        assert_eq!(results[0].filename, "No prior experience.md");
    }

    #[test]
    fn test_fuzzy_search_returns_match_indices() {
        let dir = setup_workspace();
        let (index, _dirs) = index_workspace_test(dir.path());
        let results = fuzzy_search_impl("guide", &index, 50);
        assert!(!results.is_empty());
        assert!(!results[0].match_indices.is_empty());
    }

    #[test]
    fn test_fuzzy_search_empty_query() {
        let dir = setup_workspace();
        let (index, _dirs) = index_workspace_test(dir.path());
        let results = fuzzy_search_impl("", &index, 50);
        assert!(results.is_empty());
    }

    #[test]
    fn test_fuzzy_search_respects_limit() {
        let dir = setup_workspace();
        let (index, _dirs) = index_workspace_test(dir.path());
        let results = fuzzy_search_impl("md", &index, 1);
        assert!(results.len() <= 1);
    }

    #[test]
    fn test_find_file_by_name_case_insensitive() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("assets")).unwrap();
        fs::write(dir.path().join("assets").join("Diagram.PNG"), [0u8]).unwrap();

        let found = find_file_by_name_impl(dir.path(), "diagram.png").unwrap();
        assert_eq!(found, dir.path().join("assets").join("Diagram.PNG"));
    }

    #[test]
    fn test_find_file_by_name_prefers_shortest_path() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("a").join("b")).unwrap();
        fs::write(dir.path().join("a").join("b").join("pic.png"), [0u8]).unwrap();
        fs::write(dir.path().join("pic.png"), [0u8]).unwrap();

        let found = find_file_by_name_impl(dir.path(), "pic.png").unwrap();
        assert_eq!(found, dir.path().join("pic.png"));
    }

    #[test]
    fn test_find_file_by_name_missing_and_hidden() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git").join("hidden.png"), [0u8]).unwrap();

        assert!(find_file_by_name_impl(dir.path(), "nope.png").is_none());
        assert!(find_file_by_name_impl(dir.path(), "hidden.png").is_none());
    }
}
