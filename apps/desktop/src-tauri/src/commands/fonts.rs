use crate::error::AppError;
use std::sync::OnceLock;

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, AppError> {
    static FONTS: OnceLock<Vec<String>> = OnceLock::new();
    if let Some(fonts) = FONTS.get() {
        return Ok(fonts.clone());
    }
    let fonts = tauri::async_runtime::spawn_blocking(load_family_names)
        .await
        .map_err(|error| AppError::Io(error.to_string()))?;
    if fonts.is_empty() {
        return Err(AppError::Io("No installed font families were found".into()));
    }
    Ok(FONTS.get_or_init(|| fonts).clone())
}

fn load_family_names() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    normalize_family_names(
        database
            .faces()
            .filter_map(|face| face.families.first().map(|(name, _)| name.clone())),
    )
}

fn normalize_family_names(families: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut families: Vec<String> = families
        .into_iter()
        .filter(|name| !name.starts_with('.'))
        .collect();
    families.sort_by(|left, right| (left.to_lowercase(), left).cmp(&(right.to_lowercase(), right)));
    families.dedup();
    families
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_names_are_sorted_deduplicated_and_hide_internal_families() {
        assert_eq!(
            normalize_family_names([
                "Menlo".into(),
                ".SF NS".into(),
                "Arial".into(),
                "menlo".into(),
                "Menlo".into(),
            ]),
            ["Arial", "Menlo", "menlo"]
        );
    }
}
