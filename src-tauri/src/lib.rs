use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write as IoWrite};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tokio::sync::broadcast;

const DISCORD_GAMES_API_URL: &str = "https://discord.com/api/v9/games/detectable";
const DISCORD_NON_GAMES_API_URL: &str = "https://discord.com/api/v9/applications/non-games/detectable";

const REMOTE_DEFAULT_PORT: u16 = 7523;

const CACHE_FILE_NAME: &str = "disactivity_games_cache.json";
const FAVORITES_FILE_NAME: &str = "disactivity_favorites.json";
const CUSTOM_GAMES_FILE_NAME: &str = "disactivity_custom_games.json";
const API_KEYS_FILE_NAME: &str = "disactivity_api_keys.json";
const METADATA_CACHE_FILE_NAME: &str = "disactivity_metadata_cache.json";
const DISCOVERY_CACHE_FILE_NAME: &str = "disactivity_discovery_cache.json";
const TWITCH_TOKEN_FILE_NAME: &str = "disactivity_twitch_token.json";
const PROFILES_FILE_NAME: &str = "disactivity_profiles.json";
const SCHEDULES_FILE_NAME: &str = "disactivity_schedules.json";

const CACHE_EXPIRY_DAYS: i64 = 2;
const METADATA_CACHE_EXPIRY_DAYS: i64 = 7;
const DISCOVERY_CACHE_EXPIRY_HOURS: i64 = 24;
const METADATA_CACHE_MAX_ENTRIES: usize = 500;
const KEYRING_SERVICE: &str = "disactivity";

#[cfg(target_os = "windows")]
const SLAVE_EXE: &[u8] = include_bytes!("../slave/target/release/slave.exe");

#[cfg(not(target_os = "windows"))]
const SLAVE_EXE: &[u8] = include_bytes!("../slave/target/release/slave");

// ─── Core types ───────────────────────────────────────────────────────────────

struct RunningGame {
    process: Child,
    /// Random temp dir; auto-deleted on drop when process is already dead.
    #[allow(dead_code)]
    temp_dir: tempfile::TempDir,
    ipc_shutdown: Option<std::sync::mpsc::Sender<()>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TwitchToken {
    access_token: String,
    expires_at: DateTime<Utc>,
}

struct AppState {
    running_games: Mutex<HashMap<String, RunningGame>>,
    starting_games: Mutex<HashSet<String>>,
    minimize_to_tray: Mutex<bool>,
    twitch_token: Mutex<Option<TwitchToken>>,
    custom_presence_shutdown: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    idle_watcher_shutdown: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    schedule_watcher_shutdown: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    media_watcher_shutdown: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    ide_watcher_shutdown: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    remote_server_shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    remote_event_tx: Mutex<Option<broadcast::Sender<String>>>,
}

fn lock_or_recover<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ─── Game / API types ─────────────────────────────────────────────────────────

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

// ─── Keyring helpers ──────────────────────────────────────────────────────────

fn keyring_get(key: &str) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, key)
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
}

fn keyring_set(key: &str, value: &str) {
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, key) {
        let _ = e.set_password(value);
    }
}

fn keyring_delete(key: &str) {
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, key) {
        let _ = e.delete_password();
    }
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ApiKeys {
    pub igdb_client_id: Option<String>,
    pub igdb_client_secret: Option<String>,
    pub rawg_api_key: Option<String>,
    pub media_client_id: Option<String>,
    pub ide_client_id: Option<String>,
}

fn get_api_keys_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(API_KEYS_FILE_NAME))
}

fn read_api_keys() -> ApiKeys {
    // Try the system keyring first (more secure)
    let from_keyring = ApiKeys {
        igdb_client_id: keyring_get("igdb_client_id"),
        igdb_client_secret: keyring_get("igdb_client_secret"),
        rawg_api_key: keyring_get("rawg_api_key"),
        media_client_id: keyring_get("media_client_id"),
        ide_client_id: keyring_get("ide_client_id"),
    };
    if from_keyring.igdb_client_id.is_some()
        || from_keyring.igdb_client_secret.is_some()
        || from_keyring.rawg_api_key.is_some()
        || from_keyring.media_client_id.is_some()
        || from_keyring.ide_client_id.is_some()
    {
        return from_keyring;
    }
    // Fall back to config file (backward compat for existing installations)
    let Some(path) = get_api_keys_path() else { return ApiKeys::default() };
    let Ok(content) = fs::read_to_string(&path) else { return ApiKeys::default() };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_api_keys(keys: &ApiKeys) -> Result<(), String> {
    // Write to keyring (best-effort; silent on failure)
    for (name, val) in [
        ("igdb_client_id", &keys.igdb_client_id),
        ("igdb_client_secret", &keys.igdb_client_secret),
        ("rawg_api_key", &keys.rawg_api_key),
        ("media_client_id", &keys.media_client_id),
        ("ide_client_id", &keys.ide_client_id),
    ] {
        match val.as_deref().filter(|s| !s.trim().is_empty()) {
            Some(v) => keyring_set(name, v.trim()),
            None => keyring_delete(name),
        }
    }
    // Also write the config file as a fallback / backup
    let path = get_api_keys_path().ok_or("Could not determine config directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string(keys).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_api_keys() -> ApiKeys {
    read_api_keys()
}

#[tauri::command]
fn set_api_keys(
    igdb_client_id: Option<String>,
    igdb_client_secret: Option<String>,
    rawg_api_key: Option<String>,
    media_client_id: Option<String>,
    ide_client_id: Option<String>,
) -> Result<(), String> {
    write_api_keys(&ApiKeys { igdb_client_id, igdb_client_secret, rawg_api_key, media_client_id, ide_client_id })
}

// ─── IGDB / Twitch token ──────────────────────────────────────────────────────

fn get_twitch_token_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(TWITCH_TOKEN_FILE_NAME))
}

fn load_twitch_token_from_disk() -> Option<TwitchToken> {
    let path = get_twitch_token_path()?;
    let content = fs::read_to_string(&path).ok()?;
    let token: TwitchToken = serde_json::from_str(&content).ok()?;
    // Only use if still valid (with 5-min buffer)
    if token.expires_at > Utc::now() + Duration::minutes(5) {
        Some(token)
    } else {
        None
    }
}

fn save_twitch_token_to_disk(token: &TwitchToken) {
    let Some(path) = get_twitch_token_path() else { return };
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    if let Ok(content) = serde_json::to_string(token) {
        let _ = fs::write(&path, content);
    }
}

async fn get_twitch_token(
    client_id: &str,
    client_secret: &str,
    cached: &Mutex<Option<TwitchToken>>,
) -> Result<String, String> {
    {
        let guard = lock_or_recover(cached);
        if let Some(ref t) = *guard {
            if t.expires_at > Utc::now() + Duration::minutes(5) {
                return Ok(t.access_token.clone());
            }
        }
    }

    let client = reqwest::Client::new();
    let resp: serde_json::Value = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| format!("Twitch token request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Twitch token parse failed: {}", e))?;

    let access_token = resp["access_token"]
        .as_str()
        .ok_or("No access_token in Twitch response")?
        .to_string();
    let expires_in = resp["expires_in"].as_i64().unwrap_or(3600);

    let new_token = TwitchToken {
        access_token: access_token.clone(),
        expires_at: Utc::now() + Duration::seconds(expires_in),
    };
    save_twitch_token_to_disk(&new_token);
    *lock_or_recover(cached) = Some(new_token);

    Ok(access_token)
}

// ─── IGDB Metadata ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameMetadata {
    pub cover_url: Option<String>,
    pub release_date: Option<i64>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub rating: Option<f64>,
    pub summary: Option<String>,
    pub igdb_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct MetadataCache {
    timestamp: DateTime<Utc>,
    data: HashMap<String, GameMetadata>,
}

fn get_metadata_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join(METADATA_CACHE_FILE_NAME))
}

fn read_metadata_cache() -> HashMap<String, GameMetadata> {
    let Some(path) = get_metadata_cache_path() else { return HashMap::new() };
    let Ok(content) = fs::read_to_string(&path) else { return HashMap::new() };
    let Ok(cache): Result<MetadataCache, _> = serde_json::from_str(&content) else {
        return HashMap::new()
    };
    if Utc::now().signed_duration_since(cache.timestamp).num_days() < METADATA_CACHE_EXPIRY_DAYS {
        cache.data
    } else {
        HashMap::new()
    }
}

fn save_metadata_cache(data: &HashMap<String, GameMetadata>) {
    let Some(path) = get_metadata_cache_path() else { return };
    let trimmed: HashMap<String, GameMetadata> = if data.len() > METADATA_CACHE_MAX_ENTRIES {
        data.iter()
            .take(METADATA_CACHE_MAX_ENTRIES)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    } else {
        data.clone()
    };
    let cache = MetadataCache { timestamp: Utc::now(), data: trimmed };
    if let Ok(content) = serde_json::to_string(&cache) {
        let _ = fs::write(&path, content);
    }
}

fn normalize_game_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
async fn fetch_igdb_metadata(
    game_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<GameMetadata>, String> {
    let keys = read_api_keys();
    let (client_id, client_secret) = match (&keys.igdb_client_id, &keys.igdb_client_secret) {
        (Some(id), Some(secret)) if !id.trim().is_empty() && !secret.trim().is_empty() => {
            (id.trim().to_string(), secret.trim().to_string())
        }
        _ => return Ok(None),
    };

    let normalized = normalize_game_name(&game_name);

    let mut cache = read_metadata_cache();
    if let Some(meta) = cache.get(&normalized) {
        return Ok(Some(meta.clone()));
    }

    let access_token = get_twitch_token(&client_id, &client_secret, &state.twitch_token).await?;

    let body = format!(
        "fields name,cover.url,first_release_date,genres.name,platforms.abbreviation,rating,summary; search \"{}\"; limit 3; where version_parent = null;",
        game_name.replace('"', "\\\"")
    );

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", &client_id)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "text/plain")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("IGDB request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("IGDB API error: {}", resp.status()));
    }

    let games: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    if games.is_empty() { return Ok(None); }

    let best = &games[0];
    let cover_url = best["cover"]["url"].as_str().map(|url| {
        let without_scheme = url.trim_start_matches("//");
        let big = without_scheme.replace("t_thumb", "t_cover_big");
        if big.starts_with("http") { big } else { format!("https://{}", big) }
    });

    let genres = best["genres"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|g| g["name"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    let platforms = best["platforms"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|p| p["abbreviation"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    let metadata = GameMetadata {
        cover_url,
        release_date: best["first_release_date"].as_i64(),
        genres,
        platforms,
        rating: best["rating"].as_f64(),
        summary: best["summary"].as_str().map(String::from),
        igdb_name: best["name"].as_str().map(String::from),
    };

    cache.insert(normalized, metadata.clone());
    save_metadata_cache(&cache);
    Ok(Some(metadata))
}

// ─── RAWG Discovery ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryGame {
    pub rawg_id: i64,
    pub name: String,
    pub background_image: Option<String>,
    pub rating: Option<f64>,
    pub released: Option<String>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub metacritic: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryData {
    pub trending: Vec<DiscoveryGame>,
    pub new_releases: Vec<DiscoveryGame>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DiscoveryCacheData {
    timestamp: DateTime<Utc>,
    data: DiscoveryData,
}

#[derive(Debug, Deserialize)]
struct FreeToGameEntry {
    id: i64,
    title: String,
    #[serde(default)] thumbnail: Option<String>,
    #[serde(default)] genre: Option<String>,
    #[serde(default)] platform: Option<String>,
    #[serde(default)] release_date: Option<String>,
}

fn get_discovery_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join(DISCOVERY_CACHE_FILE_NAME))
}

fn read_discovery_cache() -> Option<DiscoveryData> {
    let path = get_discovery_cache_path()?;
    let content = fs::read_to_string(&path).ok()?;
    let cache: DiscoveryCacheData = serde_json::from_str(&content).ok()?;
    if Utc::now().signed_duration_since(cache.timestamp).num_hours() < DISCOVERY_CACHE_EXPIRY_HOURS {
        Some(cache.data)
    } else {
        None
    }
}

fn save_discovery_cache(data: &DiscoveryData) {
    let Some(path) = get_discovery_cache_path() else { return };
    let cache = DiscoveryCacheData { timestamp: Utc::now(), data: data.clone() };
    if let Ok(content) = serde_json::to_string(&cache) {
        let _ = fs::write(&path, content);
    }
}

fn parse_rawg_game(game: &serde_json::Value) -> Option<DiscoveryGame> {
    let rawg_id = game["id"].as_i64()?;
    let name = game["name"].as_str()?.to_string();
    let background_image = game["background_image"].as_str().map(String::from);
    let rating = game["rating"].as_f64().filter(|&r| r > 0.0);
    let released = game["released"].as_str().map(String::from);
    let metacritic = game["metacritic"].as_i64();
    let genres = game["genres"].as_array()
        .map(|a| a.iter().filter_map(|g| g["name"].as_str().map(String::from)).collect())
        .unwrap_or_default();
    let platforms = game["platforms"].as_array()
        .map(|a| a.iter().filter_map(|p| p["platform"]["name"].as_str().map(String::from)).collect())
        .unwrap_or_default();
    Some(DiscoveryGame { rawg_id, name, background_image, rating, released, genres, platforms, metacritic })
}

async fn freetogame_fetch(sort_by: &str) -> Result<Vec<DiscoveryGame>, String> {
    let url = format!("https://www.freetogame.com/api/games?sort-by={}", sort_by);
    let resp = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "Disactivity/0.1.0")
        .send()
        .await
        .map_err(|e| format!("FreeToGame request failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("FreeToGame API error: {}", resp.status()));
    }
    let entries: Vec<FreeToGameEntry> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(entries.into_iter().take(12).map(|e| DiscoveryGame {
        rawg_id: e.id,
        name: e.title,
        background_image: e.thumbnail,
        rating: None,
        released: e.release_date,
        genres: e.genre.map(|g| vec![g]).unwrap_or_default(),
        platforms: e.platform.map(|p| vec![p]).unwrap_or_default(),
        metacritic: None,
    }).collect())
}

async fn rawg_fetch(url: &str) -> Result<Vec<DiscoveryGame>, String> {
    let resp = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "Disactivity/0.1.0")
        .send()
        .await
        .map_err(|e| format!("RAWG request failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("RAWG API error: {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body["results"].as_array()
        .map(|a| a.iter().filter_map(parse_rawg_game).collect())
        .unwrap_or_default())
}

#[tauri::command]
async fn fetch_discovery(force_refresh: bool) -> Result<DiscoveryData, String> {
    if !force_refresh {
        if let Some(cached) = read_discovery_cache() { return Ok(cached); }
    }
    let keys = read_api_keys();
    let rawg_key = keys.rawg_api_key.as_deref()
        .filter(|k| !k.trim().is_empty())
        .map(str::to_string);
    let data = if let Some(rawg_key) = rawg_key {
        let today = Utc::now().date_naive();
        let six_months_ago = today - Duration::days(180);
        let trending_url = format!(
            "https://api.rawg.io/api/games?key={}&ordering=-added&page_size=12&metacritic=70,100", rawg_key
        );
        let new_releases_url = format!(
            "https://api.rawg.io/api/games?key={}&dates={},{}&ordering=-rating&page_size=12&platforms=4&metacritic=60,100",
            rawg_key, six_months_ago.format("%Y-%m-%d"), today.format("%Y-%m-%d")
        );
        let (tr, nr) = tokio::join!(rawg_fetch(&trending_url), rawg_fetch(&new_releases_url));
        DiscoveryData { trending: tr.unwrap_or_default(), new_releases: nr.unwrap_or_default() }
    } else {
        let (tr, nr) = tokio::join!(
            freetogame_fetch("popularity"),
            freetogame_fetch("release-date")
        );
        DiscoveryData { trending: tr.unwrap_or_default(), new_releases: nr.unwrap_or_default() }
    };
    save_discovery_cache(&data);
    Ok(data)
}

// ─── Games cache ──────────────────────────────────────────────────────────────

fn get_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join(CACHE_FILE_NAME))
}

fn read_cache() -> Option<CacheData> {
    let content = fs::read_to_string(get_cache_path()?).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_cache(games: &[Game]) -> Result<(), String> {
    let path = get_cache_path().ok_or("Could not determine cache directory")?;
    let content = serde_json::to_string(&CacheData { timestamp: Utc::now(), games: games.to_vec() })
        .map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn is_cache_valid(cache: &CacheData) -> bool {
    Utc::now().signed_duration_since(cache.timestamp).num_days() < CACHE_EXPIRY_DAYS
}

// ─── Favorites ────────────────────────────────────────────────────────────────

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

// ─── Custom games ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CustomGame { id: String, name: String, executable: String }

fn get_custom_games_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(CUSTOM_GAMES_FILE_NAME))
}

fn read_custom_games() -> Vec<CustomGame> {
    let Some(path) = get_custom_games_path() else { return Vec::new() };
    let Ok(content) = fs::read_to_string(&path) else { return Vec::new() };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_custom_games(games: &[CustomGame]) -> Result<(), String> {
    let path = get_custom_games_path().ok_or("Could not determine config directory")?;
    if let Some(p) = path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    fs::write(&path, serde_json::to_string(games).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

fn custom_game_to_game(cg: &CustomGame) -> Game {
    Game {
        id: cg.id.clone(), name: cg.name.clone(), icon_hash: None,
        executables: Some(vec![Executable { name: cg.executable.clone(), os: Some("win32".into()) }]),
        aliases: vec![],
    }
}

fn generate_custom_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    format!("custom_{}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0))
}

fn validate_executable_name(exe: &str) -> Result<(), String> {
    let t = exe.trim();
    if t.is_empty() { return Err("Executable name cannot be empty".into()); }
    if !t.to_lowercase().ends_with(".exe") { return Err("Executable must end with .exe".into()); }
    if t.contains("..") { return Err("Executable path cannot contain '..'".into()); }
    if t.len() >= 2 && t.chars().nth(1) == Some(':') {
        return Err("Executable must be a relative path, not an absolute one".into());
    }
    Ok(())
}

#[tauri::command]
fn get_custom_games() -> Vec<Game> {
    read_custom_games().iter().map(custom_game_to_game).collect()
}

#[tauri::command]
fn add_custom_game(name: String, executable: String) -> Result<Game, String> {
    if name.trim().is_empty() { return Err("Game name cannot be empty".into()); }
    validate_executable_name(&executable)?;
    let mut games = read_custom_games();
    let cg = CustomGame { id: generate_custom_id(), name: name.trim().into(), executable: executable.trim().into() };
    let game = custom_game_to_game(&cg);
    games.push(cg);
    write_custom_games(&games)?;
    Ok(game)
}

#[tauri::command]
fn remove_custom_game(game_id: String) -> Result<(), String> {
    let mut games = read_custom_games();
    games.retain(|g| g.id != game_id);
    write_custom_games(&games)
}

// ─── Discord API fetch ────────────────────────────────────────────────────────

async fn fetch_from_api() -> Result<Vec<Game>, String> {
    let client = reqwest::Client::new();
    let rg = client.get(DISCORD_GAMES_API_URL).header("User-Agent", "Disactivity/0.1.0")
        .send().await.map_err(|e| format!("Failed to fetch games: {}", e))?;
    if !rg.status().is_success() { return Err(format!("API returned status: {}", rg.status())); }

    let rng = client.get(DISCORD_NON_GAMES_API_URL).header("User-Agent", "Disactivity/0.1.0")
        .send().await.map_err(|e| format!("Failed to fetch non-games: {}", e))?;

    let mut games: Vec<Game> = rg.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;
    if rng.status().is_success() {
        let non: Vec<Game> = rng.json().await.unwrap_or_default();
        games.extend(non);
    }
    Ok(games.into_iter().filter(|g| g.executables.as_ref().map_or(false, |e| !e.is_empty())).collect())
}

#[tauri::command]
async fn fetch_games(force_refresh: bool) -> Result<FetchGamesResponse, String> {
    let cached = read_cache();
    if !force_refresh {
        if let Some(ref c) = cached {
            if is_cache_valid(c) { return Ok(FetchGamesResponse { games: c.games.clone(), from_cache: true }); }
        }
    }
    match fetch_from_api().await {
        Ok(games) => {
            if let Err(e) = write_cache(&games) { eprintln!("Warning: Failed to write cache: {}", e); }
            Ok(FetchGamesResponse { games, from_cache: false })
        }
        Err(e) => {
            // Fall back to stale cache rather than hard-failing
            if let Some(c) = cached {
                eprintln!("API failed ({}), serving stale cache ({} games)", e, c.games.len());
                Ok(FetchGamesResponse { games: c.games, from_cache: true })
            } else {
                Err(e)
            }
        }
    }
}

#[tauri::command]
fn get_cache_info() -> Option<String> {
    Some(read_cache()?.timestamp.to_rfc3339())
}

// ─── Game execution ───────────────────────────────────────────────────────────

fn select_best_executable(executables: &[Executable]) -> Option<String> {
    executables.iter()
        .filter(|e| e.os.as_deref() == Some("win32") && !e.name.starts_with('>'))
        .min_by_key(|e| (e.name.matches('/').count() + e.name.matches('\\').count(), e.name.len()))
        .map(|e| e.name.clone())
}

/// Creates a randomised temp directory (prevents guessable paths) and writes slave.exe into it.
fn setup_game_executable(game_id: &str, exe_path: &str) -> Result<(tempfile::TempDir, PathBuf), String> {
    let disactivity_base = std::env::temp_dir().join("disactivity");
    fs::create_dir_all(&disactivity_base).map_err(|e| e.to_string())?;

    let temp_dir = tempfile::Builder::new()
        .prefix(game_id)
        .tempdir_in(&disactivity_base)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let exe_path_normalized = exe_path.replace('\\', "/");
    let parts: Vec<&str> = exe_path_normalized.split('/').collect();

    let mut full_dir = temp_dir.path().to_path_buf();
    for part in &parts[..parts.len().saturating_sub(1)] {
        if !part.is_empty() { full_dir = full_dir.join(part); }
    }
    fs::create_dir_all(&full_dir).map_err(|e| format!("Failed to create directories: {}", e))?;

    let exe_filename = parts.last().ok_or("Invalid executable path")?;
    #[cfg(not(target_os = "windows"))]
    let exe_filename_str: String = exe_filename.trim_end_matches(".exe").to_string();
    #[cfg(not(target_os = "windows"))]
    let exe_filename = &exe_filename_str;
    let final_exe_path = full_dir.join(exe_filename);
    fs::write(&final_exe_path, SLAVE_EXE).map_err(|e| format!("Failed to write executable: {}", e))?;

    Ok((temp_dir, final_exe_path))
}

async fn download_game_icon(game_id: &str, icon_hash: &str, temp_dir: &Path) -> Option<PathBuf> {
    let url = format!(
        "https://cdn.discordapp.com/app-icons/{}/{}.png?size=64&keep_aspect_ratio=false",
        game_id, icon_hash
    );
    let bytes = reqwest::Client::new()
        .get(&url).header("User-Agent", "Disactivity/0.1.0")
        .send().await.ok()?.bytes().await.ok()?;
    let ico = png_to_ico(&bytes);
    let path = temp_dir.join("icon.ico");
    fs::write(&path, ico).ok()?;
    Some(path)
}

/// Wraps a PNG in a proper ICO container, reading actual dimensions from the PNG IHDR chunk.
fn png_to_ico(png: &[u8]) -> Vec<u8> {
    // PNG header: 8-byte sig + 4-byte chunk-len + 4-byte "IHDR" + 4-byte width + 4-byte height
    let (ico_w, ico_h) = if png.len() >= 24 {
        let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
        let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
        // ICO byte field: 0 means 256, values >255 are clamped
        let to_ico_dim = |d: u32| if d == 0 || d >= 256 { 0u8 } else { d as u8 };
        (to_ico_dim(w), to_ico_dim(h))
    } else {
        (0u8, 0u8) // 0 = 256 in ICO format
    };

    let mut buf = Vec::with_capacity(22 + png.len());
    buf.extend_from_slice(&[0u8, 0]);        // ICONDIR: reserved
    buf.extend_from_slice(&[1u8, 0]);        // type = ICO
    buf.extend_from_slice(&[1u8, 0]);        // image count = 1
    buf.push(ico_w);                         // ICONDIRENTRY: width
    buf.push(ico_h);                         // height
    buf.push(0);                             // color count
    buf.push(0);                             // reserved
    buf.extend_from_slice(&[1u8, 0]);        // planes
    buf.extend_from_slice(&[32u8, 0]);       // bit count
    buf.extend_from_slice(&(png.len() as u32).to_le_bytes()); // data size
    buf.extend_from_slice(&22u32.to_le_bytes());              // data offset
    buf.extend_from_slice(png);
    buf
}

// ─── Discord IPC Rich Presence ────────────────────────────────────────────────

fn discord_write_frame<W: IoWrite>(pipe: &mut W, op: u32, payload: &serde_json::Value) -> std::io::Result<()> {
    let json = serde_json::to_vec(payload)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let mut frame = Vec::with_capacity(8 + json.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(json.len() as u32).to_le_bytes());
    frame.extend_from_slice(&json);
    pipe.write_all(&frame)
}

fn discord_read_frame<R: Read>(pipe: &mut R) -> std::io::Result<(u32, Vec<u8>)> {
    let mut header = [0u8; 8];
    pipe.read_exact(&mut header)?;
    let op = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let mut body = vec![0u8; len];
    pipe.read_exact(&mut body)?;
    Ok((op, body))
}

fn discord_ipc_session_inner<S: Read + IoWrite>(
    pipe: &mut S,
    client_id: &str,
    details: Option<&str>,
    state_text: Option<&str>,
    activity_type: u8,
    shutdown_rx: std::sync::mpsc::Receiver<()>,
) {
    if discord_write_frame(pipe, 0, &serde_json::json!({"v": 1, "client_id": client_id})).is_err() {
        return;
    }
    match discord_read_frame(pipe) {
        Err(_) | Ok((2, _)) => return,
        Ok(_) => {}
    }
    let start_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .saturating_sub(10);
    let activity = serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": {
                "type": activity_type,
                "timestamps": { "start": start_ts },
                "details": details.unwrap_or(""),
                "state": state_text.unwrap_or("via Disactivity")
            }
        },
        "nonce": start_ts.to_string()
    });
    if discord_write_frame(pipe, 1, &activity).is_err() { return; }
    let _ = discord_read_frame(pipe);
    loop {
        match shutdown_rx.recv_timeout(std::time::Duration::from_secs(1)) {
            Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
        }
    }
}

/// Background thread: connects to Discord IPC, sets rich-presence, holds connection
/// until `shutdown_rx` fires. Works on Windows (named pipe) and macOS/Linux (Unix socket).
/// `activity_type`: 0 = Playing, 2 = Listening.
fn discord_ipc_session(
    client_id: String,
    details: Option<String>,
    state_text: Option<String>,
    activity_type: u8,
    shutdown_rx: std::sync::mpsc::Receiver<()>,
) {
    #[cfg(windows)]
    {
        let mut pipe = match (0u8..10).find_map(|i| {
            std::fs::OpenOptions::new()
                .read(true).write(true)
                .open(format!(r"\\.\pipe\discord-ipc-{}", i))
                .ok()
        }) {
            Some(p) => p,
            None => return,
        };
        discord_ipc_session_inner(&mut pipe, &client_id, details.as_deref(), state_text.as_deref(), activity_type, shutdown_rx);
    }

    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;
        // Candidate directories in priority order
        let dirs: Vec<String> = {
            let mut v = Vec::new();
            if let Ok(d) = std::env::var("XDG_RUNTIME_DIR") { v.push(d.clone()); v.push(format!("{}/snap.discord", d)); }
            if let Ok(d) = std::env::var("TMPDIR") { v.push(d); }
            v.push("/tmp".to_string());
            v
        };
        let mut sock = match dirs.iter().find_map(|dir| {
            (0u8..10).find_map(|i| UnixStream::connect(format!("{}/discord-ipc-{}", dir, i)).ok())
        }) {
            Some(s) => s,
            None => return,
        };
        discord_ipc_session_inner(&mut sock, &client_id, details.as_deref(), state_text.as_deref(), activity_type, shutdown_rx);
    }

    // On platforms without Windows or Unix sockets (none currently), do nothing
    #[cfg(not(any(windows, unix)))]
    { let _ = shutdown_rx.recv(); }
}

// ─── Custom Rich Presence ─────────────────────────────────────────────────────

#[tauri::command]
async fn set_custom_presence(
    client_id: String,
    details: Option<String>,
    state_text: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if client_id.trim().is_empty() {
        return Err("Client ID cannot be empty".into());
    }
    // Shut down any existing custom session first
    drop(lock_or_recover(&state.custom_presence_shutdown).take());

    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let cid = client_id.trim().to_string();
    thread::spawn(move || discord_ipc_session(cid, details, state_text, 0, rx));
    *lock_or_recover(&state.custom_presence_shutdown) = Some(tx);
    Ok(())
}

#[tauri::command]
fn clear_custom_presence(state: tauri::State<'_, AppState>) -> Result<(), String> {
    drop(lock_or_recover(&state.custom_presence_shutdown).take());
    Ok(())
}

#[tauri::command]
fn get_custom_presence_active(state: tauri::State<'_, AppState>) -> bool {
    lock_or_recover(&state.custom_presence_shutdown).is_some()
}

// ─── AFK / Idle detection ─────────────────────────────────────────────────────

/// Returns seconds since the last keyboard/mouse input.
#[cfg(windows)]
fn get_idle_seconds() -> u64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    unsafe {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut info) != 0 {
            let tick = GetTickCount();
            (tick.wrapping_sub(info.dwTime) / 1000) as u64
        } else {
            0
        }
    }
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
}

#[cfg(target_os = "macos")]
fn get_idle_seconds() -> u64 {
    unsafe { CGEventSourceSecondsSinceLastEventType(1, u32::MAX) as u64 }
}

#[cfg(target_os = "linux")]
fn get_idle_seconds() -> u64 {
    std::process::Command::new("xprintidle")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(|ms| ms / 1000)
        .unwrap_or(0)
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn get_idle_seconds() -> u64 { 0 }

fn run_idle_watcher(
    threshold_secs: u64,
    app: tauri::AppHandle,
    rx: std::sync::mpsc::Receiver<()>,
) {
    loop {
        match rx.recv_timeout(std::time::Duration::from_secs(60)) {
            Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }
        if get_idle_seconds() >= threshold_secs {
            if let Some(s) = app.try_state::<AppState>() {
                cleanup_all_games(s.inner());
            }
            // Notify the frontend so the UI updates immediately
            let _ = app.emit("idle-games-stopped", ());
        }
    }
}

#[tauri::command]
fn set_idle_stop(
    enabled: bool,
    minutes: u32,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Always stop the existing watcher first
    drop(lock_or_recover(&state.idle_watcher_shutdown).take());

    if enabled && minutes > 0 {
        let threshold_secs = minutes as u64 * 60;
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        thread::spawn(move || run_idle_watcher(threshold_secs, app, rx));
        *lock_or_recover(&state.idle_watcher_shutdown) = Some(tx);
    }
    Ok(())
}

// ─── start_game ───────────────────────────────────────────────────────────────

async fn start_game_inner(
    game_id: &str,
    game_name: Option<&str>,
    executables: &[Executable],
    selected_executable: Option<&str>,
    icon_hash: Option<&str>,
) -> Result<(String, Child, tempfile::TempDir), String> {
    let exe_path = if let Some(sel) = selected_executable {
        sel.to_string()
    } else {
        select_best_executable(executables).ok_or("No suitable win32 executable found for this game")?
    };

    let (temp_dir, final_exe_path) = setup_game_executable(game_id, &exe_path)?;

    let icon_path = if let Some(hash) = icon_hash {
        download_game_icon(game_id, hash, temp_dir.path()).await
    } else {
        None
    };

    let mut cmd = Command::new(&final_exe_path);
    cmd.arg(icon_path.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default());
    if let Some(name) = game_name { cmd.arg(name); }

    let process = cmd.spawn().map_err(|e| {
        // temp_dir will be auto-deleted when it drops at end of this error path
        format!("Failed to start process: {}", e)
    })?;

    Ok((final_exe_path.to_string_lossy().to_string(), process, temp_dir))
}

#[tauri::command]
async fn start_game(
    game_id: String,
    game_name: Option<String>,
    executables: Vec<Executable>,
    selected_executable: Option<String>,
    icon_hash: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Atomically reserve the slot — prevents the TOCTOU race between check and insert
    {
        let running = lock_or_recover(&state.running_games);
        let mut starting = lock_or_recover(&state.starting_games);
        if running.contains_key(&game_id) || starting.contains(&game_id) {
            return Err("Game is already running or starting".into());
        }
        starting.insert(game_id.clone());
    }

    let result = start_game_inner(
        &game_id, game_name.as_deref(),
        &executables, selected_executable.as_deref(), icon_hash.as_deref(),
    ).await;

    lock_or_recover(&state.starting_games).remove(&game_id);

    match result {
        Ok((final_path, process, temp_dir)) => {
            let ipc_shutdown = game_name.as_deref().map(|name| {
                let (tx, rx) = std::sync::mpsc::channel::<()>();
                let gid = game_id.clone();
                let gname = name.to_string();
                thread::spawn(move || {
                    discord_ipc_session(gid, Some(gname), Some("via Disactivity".into()), 0, rx)
                });
                tx
            });

            lock_or_recover(&state.running_games).insert(
                game_id.clone(),
                RunningGame { process, temp_dir, ipc_shutdown },
            );
            Ok(final_path)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn stop_game(game_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut running = lock_or_recover(&state.running_games);
    if let Some(mut game) = running.remove(&game_id) {
        drop(game.ipc_shutdown); // signals IPC thread to close pipe
        match game.process.try_wait() {
            Ok(None) => { let _ = game.process.kill(); let _ = game.process.wait(); }
            _ => { let _ = game.process.wait(); }
        }
        // game.temp_dir (TempDir) auto-deletes here
    }
    Ok(())
}

#[tauri::command]
fn get_running_games(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(lock_or_recover(&state.running_games).keys().cloned().collect())
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *lock_or_recover(&state.minimize_to_tray) = enabled;
    Ok(())
}

// ─── Favorites ────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_favorites() -> Vec<String> { read_favorites().into_iter().collect() }

#[tauri::command]
fn add_favorite(game_id: String) -> Result<(), String> {
    let mut f = read_favorites(); f.insert(game_id); write_favorites(&f)
}

#[tauri::command]
fn remove_favorite(game_id: String) -> Result<(), String> {
    let mut f = read_favorites(); f.remove(&game_id); write_favorites(&f)
}

#[tauri::command]
fn toggle_favorite(game_id: String) -> Result<bool, String> {
    let mut f = read_favorites();
    let is_fav = if f.contains(&game_id) { f.remove(&game_id); false } else { f.insert(game_id); true };
    write_favorites(&f)?;
    Ok(is_fav)
}

// ─── Presence Profiles ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PresenceProfile {
    pub id: String,
    pub name: String,
    pub client_id: String,
    pub details: Option<String>,
    pub state_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduleEntry {
    pub id: String,
    pub profile_id: String,
    pub label: String,
    pub start_hour: u8,
    pub start_minute: u8,
    pub end_hour: u8,
    pub end_minute: u8,
    pub days: Vec<u8>,   // 0=Sun..6=Sat, empty = all days
    pub enabled: bool,
}

fn get_profiles_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(PROFILES_FILE_NAME))
}

fn read_profiles() -> Vec<PresenceProfile> {
    let Some(path) = get_profiles_path() else { return vec![] };
    let Ok(content) = fs::read_to_string(&path) else { return vec![] };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_profiles(profiles: &[PresenceProfile]) -> Result<(), String> {
    let path = get_profiles_path().ok_or("no config dir")?;
    if let Some(p) = path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    fs::write(&path, serde_json::to_string(profiles).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn get_schedules_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("disactivity").join(SCHEDULES_FILE_NAME))
}

fn read_schedules() -> Vec<ScheduleEntry> {
    let Some(path) = get_schedules_path() else { return vec![] };
    let Ok(content) = fs::read_to_string(&path) else { return vec![] };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_schedules(schedules: &[ScheduleEntry]) -> Result<(), String> {
    let path = get_schedules_path().ok_or("no config dir")?;
    if let Some(p) = path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    fs::write(&path, serde_json::to_string(schedules).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn find_active_profile() -> Option<PresenceProfile> {
    use chrono::{Datelike, Timelike, Local};
    let now = Local::now();
    let hour = now.hour() as u8;
    let minute = now.minute() as u8;
    let dow = now.weekday().num_days_from_sunday() as u8; // 0=Sun..6=Sat

    let schedules = read_schedules();
    let profiles = read_profiles();

    let active = schedules.iter().find(|s| {
        if !s.enabled { return false; }
        if !s.days.is_empty() && !s.days.contains(&dow) { return false; }
        let current_mins = hour as u16 * 60 + minute as u16;
        let start_mins = s.start_hour as u16 * 60 + s.start_minute as u16;
        let end_mins = s.end_hour as u16 * 60 + s.end_minute as u16;
        if start_mins <= end_mins {
            current_mins >= start_mins && current_mins < end_mins
        } else {
            // overnight schedule
            current_mins >= start_mins || current_mins < end_mins
        }
    })?;

    profiles.into_iter().find(|p| p.id == active.profile_id)
}

fn run_schedule_watcher(app: tauri::AppHandle, rx: std::sync::mpsc::Receiver<()>) {
    let mut current_profile_id: Option<String> = None;
    let mut ipc_shutdown: Option<std::sync::mpsc::Sender<()>> = None;

    loop {
        match rx.recv_timeout(std::time::Duration::from_secs(60)) {
            Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }
        let active = find_active_profile();
        let new_id = active.as_ref().map(|p| p.id.clone());

        if new_id != current_profile_id {
            // Stop old session
            drop(ipc_shutdown.take());
            current_profile_id = new_id.clone();

            if let Some(profile) = active {
                let (tx, session_rx) = std::sync::mpsc::channel::<()>();
                let cid = profile.client_id.clone();
                let details = profile.details.clone();
                let state_text = profile.state_text.clone();
                thread::spawn(move || discord_ipc_session(cid, details, state_text, 0, session_rx));
                ipc_shutdown = Some(tx);
            }
            let _ = app.emit("schedule-profile-changed", new_id);
        }
    }
    drop(ipc_shutdown);
}

#[tauri::command]
fn get_profiles() -> Vec<PresenceProfile> { read_profiles() }

#[tauri::command]
fn add_profile(name: String, client_id: String, details: Option<String>, state_text: Option<String>) -> Result<PresenceProfile, String> {
    let mut profiles = read_profiles();
    let profile = PresenceProfile {
        id: format!("prof_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
        name, client_id, details, state_text,
    };
    profiles.push(profile.clone());
    write_profiles(&profiles)?;
    Ok(profile)
}

#[tauri::command]
fn update_profile(id: String, name: String, client_id: String, details: Option<String>, state_text: Option<String>) -> Result<(), String> {
    let mut profiles = read_profiles();
    if let Some(p) = profiles.iter_mut().find(|p| p.id == id) {
        p.name = name; p.client_id = client_id; p.details = details; p.state_text = state_text;
    }
    write_profiles(&profiles)
}

#[tauri::command]
fn remove_profile(id: String) -> Result<(), String> {
    let mut profiles = read_profiles();
    profiles.retain(|p| p.id != id);
    write_profiles(&profiles)
}

#[tauri::command]
fn get_schedules() -> Vec<ScheduleEntry> { read_schedules() }

#[tauri::command]
fn add_schedule(profile_id: String, label: String, start_hour: u8, start_minute: u8, end_hour: u8, end_minute: u8, days: Vec<u8>) -> Result<ScheduleEntry, String> {
    let mut schedules = read_schedules();
    let entry = ScheduleEntry {
        id: format!("sched_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
        profile_id, label, start_hour, start_minute, end_hour, end_minute, days, enabled: true,
    };
    schedules.push(entry.clone());
    write_schedules(&schedules)?;
    Ok(entry)
}

#[tauri::command]
fn update_schedule(id: String, enabled: bool, label: String, start_hour: u8, start_minute: u8, end_hour: u8, end_minute: u8, days: Vec<u8>) -> Result<(), String> {
    let mut schedules = read_schedules();
    if let Some(s) = schedules.iter_mut().find(|s| s.id == id) {
        s.enabled = enabled; s.label = label;
        s.start_hour = start_hour; s.start_minute = start_minute;
        s.end_hour = end_hour; s.end_minute = end_minute;
        s.days = days;
    }
    write_schedules(&schedules)
}

#[tauri::command]
fn remove_schedule(id: String) -> Result<(), String> {
    let mut schedules = read_schedules();
    schedules.retain(|s| s.id != id);
    write_schedules(&schedules)
}

#[tauri::command]
fn set_schedule_watcher(enabled: bool, state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    drop(lock_or_recover(&state.schedule_watcher_shutdown).take());
    if enabled {
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        thread::spawn(move || run_schedule_watcher(app, rx));
        *lock_or_recover(&state.schedule_watcher_shutdown) = Some(tx);
    }
    Ok(())
}

// ─── Music Status Passthrough ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NowPlaying {
    pub artist: String,
    pub title: String,
    pub source: String,
}

#[cfg(windows)]
fn get_window_entries() -> Vec<(String, String)> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::EnumWindows;

    let mut results: Vec<(String, String)> = Vec::new();
    let ptr = &mut results as *mut Vec<(String, String)> as isize;

    unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        use windows_sys::Win32::Foundation::{TRUE, CloseHandle};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetWindowTextW, IsWindowVisible, GetWindowThreadProcessId,
        };
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return TRUE;
        }

        let mut title_buf = [0u16; 512];
        let title_len = unsafe { GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32) };
        if title_len == 0 {
            return TRUE;
        }
        let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);

        let mut pid: u32 = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == 0 { return TRUE; }

        let hproc = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if hproc.is_null() { return TRUE; }

        let mut name_buf = [0u16; 260];
        let mut name_size = name_buf.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(hproc, 0, name_buf.as_mut_ptr(), &mut name_size) };
        unsafe { CloseHandle(hproc) };

        if ok != 0 && name_size > 0 {
            let full_path = String::from_utf16_lossy(&name_buf[..name_size as usize]);
            let process_name = full_path.split('\\').last().unwrap_or("").to_lowercase();
            let results = unsafe { &mut *(lparam as *mut Vec<(String, String)>) };
            results.push((process_name, title));
        }

        TRUE
    }

    unsafe { EnumWindows(Some(callback), ptr) };
    results
}

#[cfg(windows)]
fn get_now_playing() -> Option<NowPlaying> {
    let entries = get_window_entries();
    for (proc_name, title) in &entries {
        // Spotify: "Artist - Title" when playing, "Spotify Free/Premium" when idle
        if proc_name == "spotify.exe" {
            if title.starts_with("Spotify") || title.is_empty() { continue; }
            if let Some((artist, track)) = title.split_once(" - ") {
                return Some(NowPlaying {
                    artist: artist.trim().to_string(),
                    title: track.trim().to_string(),
                    source: "Spotify".to_string(),
                });
            }
        }
        // Tidal: title format "Artist - Title | TIDAL" or just "Artist - Title"
        if proc_name == "tidal.exe" || proc_name == "tidal" {
            let clean = title.split(" | TIDAL").next().unwrap_or(title);
            if let Some((artist, track)) = clean.split_once(" - ") {
                return Some(NowPlaying {
                    artist: artist.trim().to_string(),
                    title: track.trim().to_string(),
                    source: "TIDAL".to_string(),
                });
            }
        }
        // YouTube Music (Chrome tab): "Title - YouTube Music - Google Chrome"
        if (proc_name == "chrome.exe" || proc_name == "msedge.exe") && title.contains("YouTube Music") {
            let parts: Vec<&str> = title.splitn(3, " - ").collect();
            if parts.len() >= 2 {
                return Some(NowPlaying {
                    artist: String::new(),
                    title: parts[0].trim().to_string(),
                    source: "YouTube Music".to_string(),
                });
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn get_now_playing() -> Option<NowPlaying> {
    let script = "tell application \"System Events\"\nif exists process \"Spotify\" then\ntell application \"Spotify\"\nif player state is playing then\nreturn (artist of current track) & \" ||| \" & (name of current track)\nend if\nend tell\nend if\nend tell\nreturn \"\"";
    let out = std::process::Command::new("osascript").arg("-e").arg(script).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { return None; }
    let (artist, title) = s.split_once(" ||| ")?;
    Some(NowPlaying { artist: artist.trim().to_string(), title: title.trim().to_string(), source: "Spotify".to_string() })
}

#[cfg(target_os = "linux")]
fn get_now_playing() -> Option<NowPlaying> {
    let out = std::process::Command::new("playerctl")
        .args(["metadata", "--format", "{{artist}} ||| {{title}} ||| {{playerName}}"])
        .output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let parts: Vec<&str> = s.splitn(3, " ||| ").collect();
    if parts.len() == 3 && !parts[1].is_empty() {
        return Some(NowPlaying { artist: parts[0].trim().to_string(), title: parts[1].trim().to_string(), source: parts[2].trim().to_string() });
    }
    None
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn get_now_playing() -> Option<NowPlaying> { None }

fn run_media_watcher(client_id: String, app: tauri::AppHandle, rx: std::sync::mpsc::Receiver<()>) {
    let mut last_playing: Option<NowPlaying> = None;
    let mut ipc_shutdown: Option<std::sync::mpsc::Sender<()>> = None;

    loop {
        match rx.recv_timeout(std::time::Duration::from_secs(15)) {
            Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }

        let current = get_now_playing();
        let changed = match (&last_playing, &current) {
            (None, None) => false,
            (Some(a), Some(b)) => a.title != b.title || a.artist != b.artist,
            _ => true,
        };

        if changed {
            drop(ipc_shutdown.take());
            last_playing = current.clone();
            if let Some(np) = current {
                let details = if np.artist.is_empty() {
                    np.title.clone()
                } else {
                    format!("{} - {}", np.artist, np.title)
                };
                let state_text = Some(format!("via {}", np.source));
                let (tx, session_rx) = std::sync::mpsc::channel::<()>();
                let cid = client_id.clone();
                thread::spawn(move || discord_ipc_session(cid, Some(details), state_text, 2, session_rx));
                ipc_shutdown = Some(tx);
            }
            let _ = app.emit("media-now-playing", last_playing.clone());
        }
    }
    drop(ipc_shutdown);
}

#[tauri::command]
fn set_media_watcher(enabled: bool, state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    drop(lock_or_recover(&state.media_watcher_shutdown).take());
    if enabled {
        let keys = read_api_keys();
        let client_id = keys.media_client_id
            .filter(|k| !k.trim().is_empty())
            .ok_or("No media Discord client ID configured")?;
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        thread::spawn(move || run_media_watcher(client_id.trim().to_string(), app, rx));
        *lock_or_recover(&state.media_watcher_shutdown) = Some(tx);
    }
    Ok(())
}

#[tauri::command]
fn get_now_playing_status() -> Option<NowPlaying> { get_now_playing() }

// ─── IDE Activity Integration ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IdeActivity {
    pub editor: String,
    pub project: Option<String>,
    pub file: Option<String>,
}

#[cfg(windows)]
fn get_ide_activity() -> Option<IdeActivity> {
    let entries = get_window_entries();
    for (proc_name, title) in &entries {
        // VSCode: "filename — project — Visual Studio Code"
        if proc_name == "code.exe" || proc_name == "code - insiders.exe" {
            let editor = if proc_name.contains("insiders") { "VS Code Insiders" } else { "Visual Studio Code" };
            let parts: Vec<&str> = title.split(" \u{2014} ").collect(); // em-dash separator
            let (project, file) = match parts.len() {
                1 => (None, None),
                2 => (Some(parts[1].trim()), Some(parts[0].trim())),
                _ => (parts.get(parts.len()-2).map(|s| s.trim()), Some(parts[0].trim())),
            };
            // Filter out non-project windows
            if title.contains("Visual Studio Code") && !title.starts_with("Visual Studio Code") {
                return Some(IdeActivity {
                    editor: editor.to_string(),
                    project: project.map(|s| s.replace(" - Visual Studio Code", "").replace(" \u{2014} Visual Studio Code", "").trim().to_string()),
                    file: file.map(str::to_string),
                });
            }
        }
        // JetBrains IDEs
        let ide_name = if proc_name.starts_with("idea") { Some("IntelliJ IDEA") }
            else if proc_name.starts_with("pycharm") { Some("PyCharm") }
            else if proc_name.starts_with("webstorm") { Some("WebStorm") }
            else if proc_name.starts_with("clion") { Some("CLion") }
            else if proc_name.starts_with("rider") { Some("Rider") }
            else { None };
        if let Some(name) = ide_name {
            // Title: "file [project] — IntelliJ IDEA"
            let base = title.split(" \u{2014} ").next().unwrap_or(title);
            let (file, project) = if let (Some(bi), Some(ei)) = (base.rfind('['), base.rfind(']')) {
                (Some(base[..bi].trim().to_string()), Some(base[bi+1..ei].trim().to_string()))
            } else {
                (Some(base.trim().to_string()), None)
            };
            if !base.is_empty() {
                return Some(IdeActivity { editor: name.to_string(), project, file });
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn get_ide_activity() -> Option<IdeActivity> {
    let script = "tell application \"System Events\"\nset fa to name of first application process whose frontmost is true\nset ft to \"\"\ntry\nset ft to name of front window of (first application process whose frontmost is true)\nend try\nreturn fa & \" ||| \" & ft\nend tell";
    let out = std::process::Command::new("osascript").arg("-e").arg(script).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let (app_name, title) = s.split_once(" ||| ")?;
    let editor = if app_name.contains("Code") { "Visual Studio Code" }
        else if app_name.contains("IntelliJ") { "IntelliJ IDEA" }
        else if app_name.contains("PyCharm") { "PyCharm" }
        else if app_name.contains("WebStorm") { "WebStorm" }
        else if app_name.contains("CLion") { "CLion" }
        else { return None; };
    let parts: Vec<&str> = title.split(" \u{2014} ").collect();
    let file = parts.first().map(|s| s.trim().to_string());
    let project = if parts.len() >= 2 { parts.get(parts.len()-2).map(|s| s.trim().replace(editor, "").trim().to_string()).filter(|s| !s.is_empty()) } else { None };
    Some(IdeActivity { editor: editor.to_string(), project, file })
}

#[cfg(target_os = "linux")]
fn get_ide_activity() -> Option<IdeActivity> {
    let out = std::process::Command::new("xdotool")
        .args(["getactivewindow", "getwindowname"])
        .output().ok()?;
    let title = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if title.is_empty() { return None; }
    let editor = if title.contains("Visual Studio Code") { "Visual Studio Code" }
        else if title.contains("IntelliJ IDEA") { "IntelliJ IDEA" }
        else if title.contains("PyCharm") { "PyCharm" }
        else if title.contains("WebStorm") { "WebStorm" }
        else { return None; };
    let parts: Vec<&str> = title.split(" \u{2014} ").collect();
    let file = parts.first().map(|s| s.trim().to_string());
    let project = if parts.len() >= 2 { parts.get(parts.len()-2).map(|s| s.trim().to_string()) } else { None };
    Some(IdeActivity { editor: editor.to_string(), project, file })
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn get_ide_activity() -> Option<IdeActivity> { None }

// ─── Remote control types ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteStatus {
    pub running_game_ids: Vec<String>,
    pub custom_presence_active: bool,
    pub schedule_active: bool,
    pub now_playing: Option<NowPlaying>,
    pub ide_activity: Option<IdeActivity>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteServerInfo {
    pub port: u16,
    pub addresses: Vec<String>,
    pub pin_required: bool,
    pub running: bool,
}

fn run_ide_watcher(client_id: String, app: tauri::AppHandle, rx: std::sync::mpsc::Receiver<()>) {
    let mut last_activity: Option<IdeActivity> = None;
    let mut ipc_shutdown: Option<std::sync::mpsc::Sender<()>> = None;

    loop {
        match rx.recv_timeout(std::time::Duration::from_secs(10)) {
            Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }

        let current = get_ide_activity();
        let changed = match (&last_activity, &current) {
            (None, None) => false,
            (Some(a), Some(b)) => a.project != b.project || a.file != b.file || a.editor != b.editor,
            _ => true,
        };

        if changed {
            drop(ipc_shutdown.take());
            last_activity = current.clone();
            if let Some(ide) = current {
                let details = ide.file.clone().unwrap_or_else(|| ide.editor.clone());
                let state_text = ide.project.clone().map(|p| format!("in {}", p)).or_else(|| Some(ide.editor.clone()));
                let (tx, session_rx) = std::sync::mpsc::channel::<()>();
                let cid = client_id.clone();
                thread::spawn(move || discord_ipc_session(cid, Some(details), state_text, 0, session_rx));
                ipc_shutdown = Some(tx);
            }
            let _ = app.emit("ide-activity", last_activity.clone());
        }
    }
    drop(ipc_shutdown);
}

#[tauri::command]
fn set_ide_watcher(enabled: bool, state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    drop(lock_or_recover(&state.ide_watcher_shutdown).take());
    if enabled {
        let keys = read_api_keys();
        let client_id = keys.ide_client_id
            .filter(|k| !k.trim().is_empty())
            .ok_or("No IDE Discord client ID configured")?;
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        thread::spawn(move || run_ide_watcher(client_id.trim().to_string(), app, rx));
        *lock_or_recover(&state.ide_watcher_shutdown) = Some(tx);
    }
    Ok(())
}

#[tauri::command]
fn get_ide_status() -> Option<IdeActivity> { get_ide_activity() }

// ─── Remote control server ────────────────────────────────────────────────────

fn get_local_ips(port: u16) -> Vec<String> {
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        let _ = sock.connect("8.8.8.8:80");
        if let Ok(addr) = sock.local_addr() {
            return vec![format!("{}:{}", addr.ip(), port)];
        }
    }
    vec![]
}

fn build_remote_status(state: &AppState) -> RemoteStatus {
    RemoteStatus {
        running_game_ids: lock_or_recover(&state.running_games).keys().cloned().collect(),
        custom_presence_active: lock_or_recover(&state.custom_presence_shutdown).is_some(),
        schedule_active: lock_or_recover(&state.schedule_watcher_shutdown).is_some(),
        now_playing: get_now_playing(),
        ide_activity: get_ide_activity(),
    }
}

async fn run_remote_server(
    port: u16,
    pin: Option<String>,
    app: tauri::AppHandle,
    event_tx: broadcast::Sender<String>,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) {
    use axum::{
        Router,
        routing::{delete, get, post},
        extract::ws::{Message, WebSocket, WebSocketUpgrade},
        http::{HeaderMap, StatusCode},
        response::{IntoResponse, Response},
        Json,
    };
    use tower_http::cors::{Any, CorsLayer};
    use std::sync::Arc;

    #[derive(Clone)]
    struct Ctx {
        app: tauri::AppHandle,
        pin: Option<String>,
        event_tx: broadcast::Sender<String>,
    }

    fn auth_ok(headers: &HeaderMap, pin: &Option<String>) -> bool {
        match pin {
            None => true,
            Some(p) => headers
                .get("x-pin")
                .and_then(|v| v.to_str().ok())
                .map(|v| v == p.as_str())
                .unwrap_or(false),
        }
    }

    fn unauth() -> Response {
        (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "PIN required"}))).into_response()
    }

    let ctx = Arc::new(Ctx { app, pin, event_tx });

    let app_routes = Router::new()
        // GET /api/status
        .route("/api/status", get({
            let ctx = ctx.clone();
            move |headers: HeaderMap| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    if let Some(s) = ctx.app.try_state::<AppState>() {
                        Json(build_remote_status(s.inner())).into_response()
                    } else {
                        StatusCode::SERVICE_UNAVAILABLE.into_response()
                    }
                }
            }
        }))
        // GET /api/games
        .route("/api/games", get({
            let ctx = ctx.clone();
            move |headers: HeaderMap| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    let mut games = read_cache().map(|c| c.games).unwrap_or_default();
                    // Append custom games (converted to Game shape)
                    let custom_as_games: Vec<Game> = read_custom_games().into_iter().map(|cg| Game {
                        id: cg.id,
                        name: cg.name,
                        icon_hash: None,
                        executables: Some(vec![Executable { name: cg.executable, os: None }]),
                        aliases: vec![],
                    }).collect();
                    games.extend(custom_as_games);
                    Json(games).into_response()
                }
            }
        }))
        // POST /api/games/start  body: {"game_id": "..."}
        .route("/api/games/start", post({
            let ctx = ctx.clone();
            move |headers: HeaderMap, Json(body): Json<serde_json::Value>| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    let game_id = match body["game_id"].as_str() {
                        Some(id) => id.to_string(),
                        None => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "game_id required"}))).into_response(),
                    };
                    let mut all_games = read_cache().map(|c| c.games).unwrap_or_default();
                    let custom_converted: Vec<Game> = read_custom_games().into_iter().map(|cg| Game {
                        id: cg.id,
                        name: cg.name,
                        icon_hash: None,
                        executables: Some(vec![Executable { name: cg.executable, os: None }]),
                        aliases: vec![],
                    }).collect();
                    all_games.extend(custom_converted);
                    if let Some(game) = all_games.into_iter().find(|g| g.id == game_id) {
                        let app = ctx.app.clone();
                        tokio::spawn(async move {
                            if let Some(state) = app.try_state::<AppState>() {
                                let exes = game.executables.as_deref().unwrap_or(&[]);
                                if !exes.is_empty() {
                                    if let Ok((_, process, temp_dir)) = start_game_inner(
                                        &game.id,
                                        Some(&game.name),
                                        exes,
                                        None,
                                        game.icon_hash.as_deref(),
                                    ).await {
                                        let (tx, rx) = std::sync::mpsc::channel::<()>();
                                        let cid = game.id.clone();
                                        let gname = game.name.clone();
                                        thread::spawn(move || discord_ipc_session(cid, Some(gname), None, 0, rx));
                                        let rg = RunningGame { process, temp_dir, ipc_shutdown: Some(tx) };
                                        lock_or_recover(&state.running_games).insert(game.id, rg);
                                    }
                                }
                            }
                        });
                        (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response()
                    } else {
                        (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "game not found"}))).into_response()
                    }
                }
            }
        }))
        // POST /api/games/stop  body: {"game_id": "..."}
        .route("/api/games/stop", post({
            let ctx = ctx.clone();
            move |headers: HeaderMap, Json(body): Json<serde_json::Value>| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    let game_id = match body["game_id"].as_str() {
                        Some(id) => id.to_string(),
                        None => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "game_id required"}))).into_response(),
                    };
                    if let Some(s) = ctx.app.try_state::<AppState>() {
                        let mut running = lock_or_recover(&s.running_games);
                        if let Some(mut game) = running.remove(&game_id) {
                            drop(game.ipc_shutdown.take());
                            let _ = game.process.kill();
                        }
                    }
                    (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response()
                }
            }
        }))
        // GET /api/profiles
        .route("/api/profiles", get({
            let ctx = ctx.clone();
            move |headers: HeaderMap| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    Json(read_profiles()).into_response()
                }
            }
        }))
        // POST /api/profiles/activate  body: {"profile_id": "..."}
        .route("/api/profiles/activate", post({
            let ctx = ctx.clone();
            move |headers: HeaderMap, Json(body): Json<serde_json::Value>| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    let pid = match body["profile_id"].as_str() {
                        Some(id) => id.to_string(),
                        None => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "profile_id required"}))).into_response(),
                    };
                    if let Some(s) = ctx.app.try_state::<AppState>() {
                        let profiles = read_profiles();
                        if let Some(profile) = profiles.into_iter().find(|p| p.id == pid) {
                            drop(lock_or_recover(&s.custom_presence_shutdown).take());
                            let (tx, rx) = std::sync::mpsc::channel::<()>();
                            let cid = profile.client_id.clone();
                            let details = profile.details.clone();
                            let state_text = profile.state_text.clone();
                            thread::spawn(move || discord_ipc_session(cid, details, state_text, 0, rx));
                            *lock_or_recover(&s.custom_presence_shutdown) = Some(tx);
                            return (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response();
                        }
                    }
                    (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "profile not found"}))).into_response()
                }
            }
        }))
        // DELETE /api/presence — stop all custom presence
        .route("/api/presence", delete({
            let ctx = ctx.clone();
            move |headers: HeaderMap| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    if let Some(s) = ctx.app.try_state::<AppState>() {
                        drop(lock_or_recover(&s.custom_presence_shutdown).take());
                    }
                    (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response()
                }
            }
        }))
        // GET /api/events — WebSocket event stream
        .route("/api/events", get({
            let ctx = ctx.clone();
            move |headers: HeaderMap, ws: WebSocketUpgrade| {
                let ctx = ctx.clone();
                async move {
                    if !auth_ok(&headers, &ctx.pin) { return unauth(); }
                    let mut rx = ctx.event_tx.subscribe();
                    ws.on_upgrade(move |mut socket: WebSocket| async move {
                        loop {
                            tokio::select! {
                                msg = rx.recv() => {
                                    match msg {
                                        Ok(text) => {
                                            if socket.send(Message::Text(text.into())).await.is_err() {
                                                break;
                                            }
                                        }
                                        Err(_) => break,
                                    }
                                }
                            }
                        }
                    }).into_response()
                }
            }
        }));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let router = app_routes.layer(cors);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Remote server bind failed on port {}: {}", port, e);
            return;
        }
    };

    // mDNS advertisement (best-effort; failures are silently ignored)
    let mdns = mdns_sd::ServiceDaemon::new().ok();
    let mdns_svc_type = "_disactivity._tcp.local.";
    let instance_name = "Disactivity";
    let host_name = format!("disactivity-{}.local.", port);
    let registered: Option<String> = mdns.as_ref().and_then(|d| {
        let properties: &[(&str, &str)] = &[];
        let info = mdns_sd::ServiceInfo::new(
            mdns_svc_type,
            instance_name,
            &host_name,
            "",
            port,
            properties,
        ).ok()?;
        let fullname = info.get_fullname().to_string();
        d.register(info).ok().map(|_| fullname)
    });

    axum::serve(listener, router)
        .with_graceful_shutdown(async move { let _ = shutdown_rx.await; })
        .await
        .ok();

    // Unregister mDNS
    if let (Some(d), Some(fullname)) = (mdns, registered) {
        let _ = d.unregister(&fullname);
        let _ = d.shutdown();
    }
}

#[tauri::command]
async fn set_remote_server(
    enabled: bool,
    port: Option<u16>,
    pin: Option<String>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<RemoteServerInfo, String> {
    // Stop any existing server
    if let Ok(mut g) = state.remote_server_shutdown.lock() {
        if let Some(tx) = g.take() {
            let _ = tx.send(());
        }
    }
    drop(lock_or_recover(&state.remote_event_tx).take());

    let actual_port = port.unwrap_or(REMOTE_DEFAULT_PORT);

    if !enabled {
        return Ok(RemoteServerInfo {
            port: actual_port,
            addresses: vec![],
            pin_required: false,
            running: false,
        });
    }

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (event_tx, _) = broadcast::channel::<String>(64);

    *lock_or_recover(&state.remote_server_shutdown) = Some(shutdown_tx);
    *lock_or_recover(&state.remote_event_tx) = Some(event_tx.clone());

    let app_clone = app.clone();
    let pin_clone = pin.clone();
    let etx = event_tx.clone();
    tokio::spawn(async move {
        run_remote_server(actual_port, pin_clone, app_clone, etx, shutdown_rx).await;
    });

    Ok(RemoteServerInfo {
        port: actual_port,
        addresses: get_local_ips(actual_port),
        pin_required: pin.is_some(),
        running: true,
    })
}

#[tauri::command]
fn get_remote_server_info(state: tauri::State<'_, AppState>) -> RemoteServerInfo {
    let running = lock_or_recover(&state.remote_server_shutdown).is_some();
    RemoteServerInfo {
        port: REMOTE_DEFAULT_PORT,
        addresses: if running { get_local_ips(REMOTE_DEFAULT_PORT) } else { vec![] },
        pin_required: false,
        running,
    }
}

#[allow(dead_code)]
fn emit_remote_event(state: &AppState, event: &str, data: &serde_json::Value) {
    if let Some(tx) = lock_or_recover(&state.remote_event_tx).as_ref() {
        let msg = serde_json::json!({"event": event, "data": data});
        let _ = tx.send(msg.to_string());
    }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

fn cleanup_all_games(state: &AppState) {
    // Shut down auxiliary background sessions
    drop(lock_or_recover(&state.custom_presence_shutdown).take());
    drop(lock_or_recover(&state.idle_watcher_shutdown).take());
    drop(lock_or_recover(&state.schedule_watcher_shutdown).take());
    drop(lock_or_recover(&state.media_watcher_shutdown).take());
    drop(lock_or_recover(&state.ide_watcher_shutdown).take());
    if let Ok(mut g) = state.remote_server_shutdown.lock() { drop(g.take()); }

    if let Ok(mut running) = state.running_games.lock() {
        for (_, mut game) in running.drain() {
            drop(game.ipc_shutdown);
            let _ = game.process.kill();
            let _ = game.process.wait();
            // game.temp_dir (TempDir) auto-deletes here
        }
    }
    // Clean up the disactivity base dir for any stragglers from previous runs
    let base = std::env::temp_dir().join("disactivity");
    if base.exists() { let _ = fs::remove_dir_all(&base); }
}

// ─── App entrypoint ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            running_games: Mutex::new(HashMap::new()),
            starting_games: Mutex::new(HashSet::new()),
            minimize_to_tray: Mutex::new(true),
            twitch_token: Mutex::new(load_twitch_token_from_disk()),
            custom_presence_shutdown: Mutex::new(None),
            idle_watcher_shutdown: Mutex::new(None),
            schedule_watcher_shutdown: Mutex::new(None),
            media_watcher_shutdown: Mutex::new(None),
            ide_watcher_shutdown: Mutex::new(None),
            remote_server_shutdown: Mutex::new(None),
            remote_event_tx: Mutex::new(None),
        })
        .setup(|app| {
            // Apply Mica backdrop on Windows 11; no-op on other platforms
            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                use tauri::window::{Effect, EffectsBuilder};
                let _ = win.set_effects(EffectsBuilder::new().effect(Effect::Mica).build());
            }

            let show_item = MenuItem::with_id(app, "show", "Show Disactivity", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            let icon = app.default_window_icon().expect("no default window icon").clone();

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Disactivity")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show(); let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        if let Some(s) = app.try_state::<AppState>() { cleanup_all_games(s.inner()); }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left, button_state: MouseButtonState::Up, ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) { let _ = win.hide(); }
                            else { let _ = win.show(); let _ = win.set_focus(); }
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
            set_minimize_to_tray,
            get_custom_games,
            add_custom_game,
            remove_custom_game,
            get_api_keys,
            set_api_keys,
            fetch_igdb_metadata,
            fetch_discovery,
            set_custom_presence,
            clear_custom_presence,
            get_custom_presence_active,
            set_idle_stop,
            get_profiles,
            add_profile,
            update_profile,
            remove_profile,
            get_schedules,
            add_schedule,
            update_schedule,
            remove_schedule,
            set_schedule_watcher,
            set_media_watcher,
            get_now_playing_status,
            set_ide_watcher,
            get_ide_status,
            set_remote_server,
            get_remote_server_info,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let minimize = app.try_state::<AppState>()
                    .map(|s| *lock_or_recover(&s.minimize_to_tray))
                    .unwrap_or(true);
                if minimize {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    if let Some(s) = app.try_state::<AppState>() { cleanup_all_games(s.inner()); }
                    app.exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
