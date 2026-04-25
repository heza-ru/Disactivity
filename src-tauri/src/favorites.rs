use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

const FAVORITES_FILE_NAME: &str = "disactivity_favorites.json";

fn get_favorites_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(FAVORITES_FILE_NAME))
}

fn read_favorites() -> HashSet<String> {
    let Some(path) = get_favorites_path() else { return HashSet::new() };
    let Ok(content) = fs::read_to_string(&path) else { return HashSet::new() };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_favorites(favorites: &HashSet<String>) -> Result<(), String> {
    let path = get_favorites_path().ok_or("Could not determine config directory")?;
    if let Some(p) = path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    fs::write(&path, serde_json::to_string(favorites).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favorites() -> Vec<String> {
    read_favorites().into_iter().collect()
}

#[tauri::command]
pub fn add_favorite(game_id: String) -> Result<(), String> {
    let mut f = read_favorites();
    f.insert(game_id);
    write_favorites(&f)
}

#[tauri::command]
pub fn add_favorites_if_missing(game_ids: Vec<String>) -> Result<usize, String> {
    let mut f = read_favorites();
    let mut added: usize = 0;
    for id in game_ids {
        if f.insert(id) {
            added += 1;
        }
    }
    write_favorites(&f)?;
    Ok(added)
}

#[tauri::command]
pub fn remove_favorite(game_id: String) -> Result<(), String> {
    let mut f = read_favorites();
    f.remove(&game_id);
    write_favorites(&f)
}

#[tauri::command]
pub fn toggle_favorite(game_id: String) -> Result<bool, String> {
    let mut f = read_favorites();
    let is_fav = if f.contains(&game_id) { f.remove(&game_id); false } else { f.insert(game_id); true };
    write_favorites(&f)?;
    Ok(is_fav)
}
