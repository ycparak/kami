use crate::error::AppError;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct ImageSaveResult {
    pub relative_path: String,
    pub absolute_path: String,
}

#[tauri::command]
pub fn save_clipboard_image(
    markdown_file_path: String,
    image_data: Vec<u8>,
    format: String,
) -> Result<ImageSaveResult, AppError> {
    save_clipboard_image_impl(&markdown_file_path, &image_data, &format)
}

pub fn save_clipboard_image_impl(
    markdown_file_path: &str,
    image_data: &[u8],
    format: &str,
) -> Result<ImageSaveResult, AppError> {
    let md_path = PathBuf::from(markdown_file_path);
    let md_dir = md_path
        .parent()
        .ok_or_else(|| AppError::Io("No parent directory".into()))?;
    let md_stem = md_path
        .file_stem()
        .ok_or_else(|| AppError::Io("No file stem".into()))?
        .to_string_lossy()
        .to_string();

    let assets_dir_name = format!("{}-assets", md_stem);
    let assets_dir = md_dir.join(&assets_dir_name);
    fs::create_dir_all(&assets_dir)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let (year, month, day, hour, min, sec) = epoch_to_datetime(secs);
    let short_uuid = &uuid::Uuid::new_v4().to_string()[..4];
    let ext = match format {
        "jpeg" | "jpg" => "jpg",
        "webp" => "webp",
        _ => "png",
    };
    let filename = format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}-{}.{}",
        year, month, day, hour, min, sec, short_uuid, ext
    );

    let abs_path = assets_dir.join(&filename);
    fs::write(&abs_path, image_data)?;

    let relative_path = format!("{}/{}", assets_dir_name, filename);

    Ok(ImageSaveResult {
        relative_path,
        absolute_path: abs_path.to_string_lossy().to_string(),
    })
}

fn epoch_to_datetime(secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hour = time_of_day / 3600;
    let min = (time_of_day % 3600) / 60;
    let sec = time_of_day % 60;

    let mut y = 1970;
    let mut remaining = days;

    loop {
        let days_in_year = if is_leap_year(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }

    let days_in_months: [u64; 12] = if is_leap_year(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut m = 0;
    for (i, &days_in_month) in days_in_months.iter().enumerate() {
        if remaining < days_in_month {
            m = i as u64 + 1;
            break;
        }
        remaining -= days_in_month;
    }

    let d = remaining + 1;
    (y, m, d, hour, min, sec)
}

fn is_leap_year(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_md_file() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let md_path = dir.path().join("note.md");
        fs::write(&md_path, "# Note").unwrap();
        (dir, md_path)
    }

    #[test]
    fn test_save_creates_assets_directory() {
        let (dir, md_path) = setup_md_file();
        save_clipboard_image_impl(&md_path.to_string_lossy(), &[0x89, 0x50, 0x4E, 0x47], "png")
            .unwrap();

        let assets_dir = dir.path().join("note-assets");
        assert!(assets_dir.exists());
        assert!(assets_dir.is_dir());
    }

    #[test]
    fn test_save_returns_relative_path() {
        let (_dir, md_path) = setup_md_file();
        let result =
            save_clipboard_image_impl(&md_path.to_string_lossy(), &[1, 2, 3], "png").unwrap();

        assert!(result.relative_path.starts_with("note-assets/"));
        assert!(result.relative_path.ends_with(".png"));
    }

    #[test]
    fn test_save_filename_format() {
        let (_dir, md_path) = setup_md_file();
        let result =
            save_clipboard_image_impl(&md_path.to_string_lossy(), &[1, 2, 3], "png").unwrap();

        let filename = result.relative_path.strip_prefix("note-assets/").unwrap();
        let re = regex_lite::Regex::new(r"^\d{8}-\d{6}-[a-f0-9]{4}\.png$").unwrap();
        assert!(
            re.is_match(filename),
            "Filename '{}' does not match expected format",
            filename
        );
    }

    #[test]
    fn test_save_preserves_image_data() {
        let (dir, md_path) = setup_md_file();
        let data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let result = save_clipboard_image_impl(&md_path.to_string_lossy(), &data, "png").unwrap();

        let saved = fs::read(dir.path().join(&result.relative_path)).unwrap();
        assert_eq!(saved, data);
    }
}
