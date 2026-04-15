use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

const DISCORD_GAMES_API_URL: &str = "https://discord.com/api/v9/games/detectable";
const DISCORD_NON_GAMES_API_URL: &str = "https://discord.com/api/v9/applications/non-games/detectable";

const CACHE_FILE_NAME: &str = "disactivity_games_cache.json";
const FAVORITES_FILE_NAME: &str = "disactivity_favorites.json";
const CACHE_EXPIRY_DAYS: i64 = 2;

// Embedded slave executable bytes (built in release mode)
const SLAVE_EXE: &[u8] = include_bytes!("../slave/target/release/slave.exe");

/// Tracks a running game process
struct RunningGame {
    process: Child,
    temp_dir: PathBuf,
}

/// State to track all running game processes
struct AppState {
    running_games: Mutex<HashMap<String, RunningGame>>,
    minimize_to_tray: Mutex<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Executable {
    pub name: String,
    #[serde(default)]
    pub os: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Game {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon_hash: Option<String>,
    #[serde(default)]
    pub executables: Option<Vec<Executable>>,
    pub aliases: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CacheData {
    timestamp: DateTime<Utc>,
    games: Vec<Game>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FetchGamesResponse {
    pub games: Vec<Game>,
    pub from_cache: bool,
}

fn get_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join(CACHE_FILE_NAME))
}

fn read_cache() -> Option<CacheData> {
    let cache_path = get_cache_path()?;
    let content = fs::read_to_string(&cache_path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_cache(games: &[Game]) -> Result<(), String> {
    let cache_path = get_cache_path().ok_or("Could not determine cache directory")?;
    let cache_data = CacheData {
        timestamp: Utc::now(),
        games: games.to_vec(),
    };
    let content = serde_json::to_string(&cache_data).map_err(|e| e.to_string())?;
    fs::write(&cache_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn is_cache_valid(cache: &CacheData) -> bool {
    let now = Utc::now();
    let cache_age = now.signed_duration_since(cache.timestamp);
    cache_age.num_days() < CACHE_EXPIRY_DAYS
}

// Favorites functions
fn get_favorites_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(FAVORITES_FILE_NAME))
}

fn read_favorites() -> HashSet<String> {
    let Some(path) = get_favorites_path() else {
        return HashSet::new();
    };

    let Ok(content) = fs::read_to_string(&path) else {
        return HashSet::new();
    };

    serde_json::from_str(&content).unwrap_or_default()
}

fn write_favorites(favorites: &HashSet<String>) -> Result<(), String> {
    let path = get_favorites_path().ok_or("Could not determine config directory")?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string(favorites).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

async fn fetch_from_api() -> Result<Vec<Game>, String> {
    let client = reqwest::Client::new();
    let response_games = client
        .get(DISCORD_GAMES_API_URL)
        .header("User-Agent", "Disactivity/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch games: {}", e))?;

    if !response_games.status().is_success() {
        return Err(format!("API returned status: {}", response_games.status()));
    }

    let response_non_games = client
        .get(DISCORD_NON_GAMES_API_URL)
        .header("User-Agent", "Disactivity/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch games: {}", e))?;

    let mut games: Vec<Game> = response_games
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if response_non_games.status().is_success() {
        let non_games: Vec<Game> = response_non_games
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        games.extend(non_games);
    }

    Ok(games.iter().filter(|game| {
        game.executables
            .as_ref()
            .map_or(false, |execs| !execs.is_empty())
    }).cloned().collect())
}

#[tauri::command]
async fn fetch_games(force_refresh: bool) -> Result<FetchGamesResponse, String> {
    // Check cache first if not forcing refresh
    if !force_refresh {
        if let Some(cache) = read_cache() {
            if is_cache_valid(&cache) {
                return Ok(FetchGamesResponse {
                    games: cache.games,
                    from_cache: true,
                });
            }
        }
    }

    // Fetch from API
    let games = fetch_from_api().await?;

    // Write to cache
    if let Err(e) = write_cache(&games) {
        eprintln!("Warning: Failed to write cache: {}", e);
    }

    Ok(FetchGamesResponse {
        games,
        from_cache: false,
    })
}

#[tauri::command]
fn get_cache_info() -> Option<String> {
    let cache = read_cache()?;
    Some(cache.timestamp.to_rfc3339())
}

/// Select the best executable for win32 platform
/// Filters by os == "win32", excludes paths starting with ">", and picks shortest path
fn select_best_executable(executables: &[Executable]) -> Option<String> {
    executables
        .iter()
        .filter(|exe| {
            // Must be win32
            exe.os.as_deref() == Some("win32")
            // Must not start with ">" (which indicates "starts with" pattern)
            && !exe.name.starts_with('>')
        })
        .min_by_key(|exe| {
            // Pick the one with fewest path separators, then shortest length
            let separators = exe.name.matches('/').count() + exe.name.matches('\\').count();
            (separators, exe.name.len())
        })
        .map(|exe| exe.name.clone())
}

/// Create the directory structure and place the slave executable
fn setup_game_executable(game_id: &str, exe_path: &str) -> Result<(PathBuf, PathBuf), String> {
    // Get system temp directory
    let temp_base = std::env::temp_dir().join("disactivity").join(game_id);

    // Parse the executable path and create directory structure
    // exe_path might be something like "path/to/game.exe" or just "game.exe"
    let exe_path_normalized = exe_path.replace('\\', "/");
    let path_parts: Vec<&str> = exe_path_normalized.split('/').collect();

    // Create the full path including directories
    let mut full_dir = temp_base.clone();
    for part in &path_parts[..path_parts.len().saturating_sub(1)] {
        if !part.is_empty() {
            full_dir = full_dir.join(part);
        }
    }

    // Create all directories
    fs::create_dir_all(&full_dir).map_err(|e| format!("Failed to create directories: {}", e))?;

    // Get the executable filename
    let exe_filename = path_parts.last().ok_or("Invalid executable path")?;
    let final_exe_path = full_dir.join(exe_filename);

    // Write the slave executable
    fs::write(&final_exe_path, SLAVE_EXE)
        .map_err(|e| format!("Failed to write executable: {}", e))?;

    Ok((temp_base, final_exe_path))
}

/// Clean up a game's temp directory
fn cleanup_game(temp_dir: &PathBuf) -> Result<(), String> {
    if temp_dir.exists() {
        fs::remove_dir_all(temp_dir).map_err(|e| format!("Failed to cleanup: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn start_game(
    game_id: String,
    executables: Vec<Executable>,
    selected_executable: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Check if game is already running
    {
        let running = state.running_games.lock().map_err(|e| e.to_string())?;
        if running.contains_key(&game_id) {
            return Err("Game is already running".to_string());
        }
    }

    // Use the selected executable if provided, otherwise auto-select the best one
    let exe_path = if let Some(selected) = selected_executable {
        selected
    } else {
        select_best_executable(&executables)
            .ok_or("No suitable win32 executable found for this game")?
    };

    // Setup the executable in temp directory
    let (temp_dir, final_exe_path) = setup_game_executable(&game_id, &exe_path)?;

    // Start the process
    let process = Command::new(&final_exe_path)
        .spawn()
        .map_err(|e| {
            // Cleanup on failure
            let _ = cleanup_game(&temp_dir);
            format!("Failed to start process: {}", e)
        })?;

    // Store the running game
    let mut running = state.running_games.lock().map_err(|e| e.to_string())?;
    running.insert(
        game_id.clone(),
        RunningGame {
            process,
            temp_dir,
        },
    );

    Ok(final_exe_path.to_string_lossy().to_string())
}

#[tauri::command]
fn stop_game(game_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut running = state.running_games.lock().map_err(|e| e.to_string())?;

    if let Some(mut game) = running.remove(&game_id) {
        // Only kill if still running — avoids an error on already-exited processes
        match game.process.try_wait() {
            Ok(None) => {
                // Process is still alive, terminate it
                let _ = game.process.kill();
                let _ = game.process.wait();
            }
            _ => {
                // Already exited (or try_wait failed); just reap
                let _ = game.process.wait();
            }
        }

        // Cleanup temp directory
        cleanup_game(&game.temp_dir)?;
    }

    Ok(())
}

#[tauri::command]
fn get_running_games(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let running = state.running_games.lock().map_err(|e| e.to_string())?;
    Ok(running.keys().cloned().collect())
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.minimize_to_tray.lock().map_err(|e| e.to_string())? = enabled;
    Ok(())
}

#[tauri::command]
fn get_favorites() -> Vec<String> {
    read_favorites().into_iter().collect()
}

#[tauri::command]
fn add_favorite(game_id: String) -> Result<(), String> {
    let mut favorites = read_favorites();
    favorites.insert(game_id);
    write_favorites(&favorites)
}

#[tauri::command]
fn remove_favorite(game_id: String) -> Result<(), String> {
    let mut favorites = read_favorites();
    favorites.remove(&game_id);
    write_favorites(&favorites)
}

#[tauri::command]
fn toggle_favorite(game_id: String) -> Result<bool, String> {
    let mut favorites = read_favorites();
    let is_favorite = if favorites.contains(&game_id) {
        favorites.remove(&game_id);
        false
    } else {
        favorites.insert(game_id);
        true
    };
    write_favorites(&favorites)?;
    Ok(is_favorite)
}

/// Stop all running games and cleanup
fn cleanup_all_games(state: &AppState) {
    if let Ok(mut running) = state.running_games.lock() {
        for (_, mut game) in running.drain() {
            let _ = game.process.kill();
            let _ = game.process.wait();
            let _ = cleanup_game(&game.temp_dir);
        }
    }

    // Also cleanup the base disactivity temp directory if it exists
    let temp_base = std::env::temp_dir().join("disactivity");
    if temp_base.exists() {
        let _ = fs::remove_dir_all(&temp_base);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            running_games: Mutex::new(HashMap::new()),
            minimize_to_tray: Mutex::new(true),
        })
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show Disactivity", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            let icon = app
                .default_window_icon()
                .expect("no default window icon")
                .clone();

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Disactivity")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        // Clean up running game processes before exit
                        if let Some(state) = app.try_state::<AppState>() {
                            cleanup_all_games(state.inner());
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click toggles window visibility
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_games,
            get_cache_info,
            start_game,
            stop_game,
            get_running_games,
            get_favorites,
            add_favorite,
            remove_favorite,
            toggle_favorite,
            set_minimize_to_tray
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let minimize_to_tray = app
                    .try_state::<AppState>()
                    .map(|s| *s.minimize_to_tray.lock().unwrap_or_else(|p| p.into_inner()))
                    .unwrap_or(true);

                if minimize_to_tray {
                    // Hide to tray instead of quitting
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // Close directly — clean up running games first
                    if let Some(state) = app.try_state::<AppState>() {
                        cleanup_all_games(state.inner());
                    }
                    app.exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
