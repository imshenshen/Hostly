use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const DEFAULT_FOLDER_ID: &str = "default";
const DEFAULT_FOLDER_NAME: &str = "默认文件夹";

fn default_folder_id() -> String {
    DEFAULT_FOLDER_ID.to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderMetadata {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub multi_select: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileMetadata {
    pub id: String,
    pub name: String,
    pub active: bool,
    #[serde(default = "default_folder_id")]
    pub folder_id: String,
    /// Remote URL for downloading hosts (if applicable)
    pub url: Option<String>,
    /// Last successful update timestamp (ISO 8601)
    pub last_update: Option<String>,
    /// Auto-update interval in seconds (0 or None means manual)
    pub update_interval: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct AppConfig {
    pub multi_select: bool,
    pub theme: Option<String>,
    pub window_mode: Option<String>, // "fixed", "remember"
    pub window_width: Option<f64>,
    pub window_height: Option<f64>,
    pub sidebar_width: Option<f64>,
    pub folders: Vec<FolderMetadata>,
    pub profiles: Vec<ProfileMetadata>,
    pub active_profile_ids: Vec<String>, // Deprecated in favor of internal active flag? Or keep synced? 
                                         // Let's keep synced or just use 'active' field in ProfileMetadata for simplicity.
                                         // Actually, sticking to what I planned: ProfileMetadata has 'active'. 
                                         // But for multi-select logic, we need to know who is active quickly. 
                                         // Let's trust ProfileMetadata.active as source of truth.
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileData {
    pub id: String,
    pub name: String,
    pub content: String,
    pub active: bool,
    pub folder_id: String,
    pub url: Option<String>,
    pub last_update: Option<String>,
    pub update_interval: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderData {
    pub id: String,
    pub name: String,
    pub multi_select: bool,
    pub profiles: Vec<ProfileData>,
}

pub enum Context<'a> {
    Tauri(&'a AppHandle),
    Headless,
    HeadlessAt(PathBuf),
}

impl<'a> Context<'a> {
    pub fn get_app_dir(&self) -> Result<PathBuf, String> {
        match self {
            Context::Tauri(app) => app.path().app_data_dir().map_err(|e| e.to_string()),
            Context::HeadlessAt(path) => Ok(path.clone()),
            Context::Headless => {
                // Hardcoded fallback for headless CLI to match Tauri's app_data_dir for "com.hostly.app"
                #[cfg(target_os = "windows")]
                {
                    let base = std::env::var("APPDATA").map(PathBuf::from).map_err(|_| "APPDATA env var not found")?;
                    Ok(base.join("com.hostly.switcher"))
                }
                #[cfg(target_os = "macos")]
                {
                    let home = std::env::var("HOME").map(PathBuf::from).map_err(|_| "HOME env var not found")?;
                    Ok(home.join("Library/Application Support/com.hostly.switcher"))
                }
                #[cfg(target_os = "linux")]
                {
                    if let Ok(data_home) = std::env::var("XDG_DATA_HOME") {
                        Ok(PathBuf::from(data_home).join("com.hostly.switcher"))
                    } else {
                        let home = std::env::var("HOME").map(PathBuf::from).map_err(|_| "HOME env var not found")?;
                        Ok(home.join(".local/share/com.hostly.switcher"))
                    }
                }
            }
        }
    }
}

fn is_switchhosts_folder_item(item: &serde_json::Value) -> bool {
    let folder_flag = item.get("folder").and_then(|v| v.as_bool()).unwrap_or(false);
    let type_folder = item.get("type").and_then(|v| v.as_str()) == Some("folder");
    let folder_mode = item
        .get("folder_mode")
        .and_then(|v| v.as_i64())
        .map(|v| v != 0)
        .unwrap_or(false);
    let has_children = item
        .get("children")
        .and_then(|c| c.as_array())
        .map(|children| !children.is_empty())
        .unwrap_or(false);

    folder_flag || type_folder || folder_mode || has_children
}

fn get_profiles_dir(ctx: &Context) -> Result<PathBuf, String> {
    let dir = ctx.get_app_dir()?.join("profiles");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

fn get_config_path(ctx: &Context) -> Result<PathBuf, String> {
    Ok(ctx.get_app_dir()?.join("config.json"))
}

fn get_common_path(ctx: &Context) -> Result<PathBuf, String> {
    Ok(ctx.get_app_dir()?.join("common.txt"))
}

fn ensure_default_folder(config: &mut AppConfig) -> bool {
    let mut changed = false;

    if !config.folders.iter().any(|f| f.id == DEFAULT_FOLDER_ID) {
        config.folders.insert(0, FolderMetadata {
            id: DEFAULT_FOLDER_ID.to_string(),
            name: DEFAULT_FOLDER_NAME.to_string(),
            multi_select: config.multi_select,
        });
        changed = true;
    }

    let folder_ids: std::collections::HashSet<String> =
        config.folders.iter().map(|f| f.id.clone()).collect();
    for profile in &mut config.profiles {
        if profile.folder_id.is_empty() || !folder_ids.contains(&profile.folder_id) {
            profile.folder_id = DEFAULT_FOLDER_ID.to_string();
            changed = true;
        }
    }

    changed
}

fn get_folder_multi_select(config: &AppConfig, folder_id: &str) -> bool {
    config
        .folders
        .iter()
        .find(|f| f.id == folder_id)
        .map(|f| f.multi_select)
        .unwrap_or(false)
}

fn get_or_create_folder_by_name_internal(ctx: &Context, name: &str) -> Result<String, String> {
    let mut config = load_config_internal(ctx)?;
    if let Some(folder) = config.folders.iter().find(|f| f.name == name) {
        return Ok(folder.id.clone());
    }

    let id = Uuid::new_v4().to_string();
    config.folders.push(FolderMetadata {
        id: id.clone(),
        name: name.to_string(),
        multi_select: false,
    });
    save_config_internal(ctx, &config)?;
    Ok(id)
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    load_config_internal(&Context::Tauri(&app))
}

pub fn load_config_internal(ctx: &Context) -> Result<AppConfig, String> {
    let path = get_config_path(ctx)?;
    if !path.exists() {
        // First Run: Create defaults
        let mut config = AppConfig::default();
        config.multi_select = false;
        config.folders.push(FolderMetadata {
            id: DEFAULT_FOLDER_ID.to_string(),
            name: DEFAULT_FOLDER_NAME.to_string(),
            multi_select: false,
        });
        
        let defaults = vec!["Dev", "Test", "Prod"];
        
        // 1. Auto-backup System Hosts
        let sys_id = Uuid::new_v4().to_string();
        let sys_hosts_content = crate::hosts::get_system_hosts();
        let sys_content = sys_hosts_content.unwrap_or_else(|_| "# Backup failed".to_string());
        
        save_profile_file_internal(ctx, &sys_id, &sys_content)?;
        config.profiles.push(ProfileMetadata {
            id: sys_id,
            name: "系统hosts备份".to_string(),
            active: false,
            folder_id: DEFAULT_FOLDER_ID.to_string(),
            url: None,
            last_update: None,
            update_interval: None,
        });

        // 2. Default Envs
        for name in defaults {
             let id = Uuid::new_v4().to_string();
             save_profile_file_internal(ctx, &id, "# New Environment\n")?;
             config.profiles.push(ProfileMetadata {
                 id,
                 name: name.to_string(),
                 active: false,
                 folder_id: DEFAULT_FOLDER_ID.to_string(),
                 url: None,
                 last_update: None,
                 update_interval: None,
             });
        }
        
        save_config_internal(ctx, &config)?;
        return Ok(config);
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut config: AppConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if ensure_default_folder(&mut config) {
        save_config_internal(ctx, &config)?;
    }
    Ok(config)
}

pub fn save_config_internal(ctx: &Context, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(ctx)?;
    if let Some(parent) = path.parent() {
        if !parent.exists() {
             fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let mut normalized = config.clone();
    ensure_default_folder(&mut normalized);
    let content = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn save_profile_file_internal(ctx: &Context, id: &str, content: &str) -> Result<(), String> {
    let dir = get_profiles_dir(ctx)?;
    let path = dir.join(format!("{}.txt", id));
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_common_config(app: AppHandle) -> Result<String, String> {
    load_common_config_internal(&Context::Tauri(&app))
}

pub fn load_common_config_internal(ctx: &Context) -> Result<String, String> {
    let path = get_common_path(ctx)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_common_config(app: AppHandle, content: String) -> Result<(), String> {
    save_common_config_internal(&Context::Tauri(&app), content)?;
    apply_config(app)
}

pub fn save_common_config_internal(ctx: &Context, content: String) -> Result<(), String> {
    let path = get_common_path(ctx)?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    set_theme_internal(&Context::Tauri(&app), theme)
}

pub fn set_theme_internal(ctx: &Context, theme: String) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    config.theme = Some(theme);
    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn save_window_config(app: AppHandle, mode: String, width: f64, height: f64) -> Result<(), String> {
    save_window_config_internal(&Context::Tauri(&app), mode, width, height)
}

pub fn save_window_config_internal(ctx: &Context, mode: String, width: f64, height: f64) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    config.window_mode = Some(mode);
    config.window_width = Some(width);
    config.window_height = Some(height);
    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn save_sidebar_config(app: AppHandle, width: f64) -> Result<(), String> {
    save_sidebar_config_internal(&Context::Tauri(&app), width)
}

pub fn save_sidebar_config_internal(ctx: &Context, width: f64) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    config.sidebar_width = Some(width);
    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn list_profiles(app: AppHandle) -> Result<Vec<ProfileData>, String> {
    list_profiles_internal(&Context::Tauri(&app))
}

pub fn list_profiles_internal(ctx: &Context) -> Result<Vec<ProfileData>, String> {
    let config = load_config_internal(ctx)?;
    let dir = get_profiles_dir(ctx)?;
    
    let mut profiles = Vec::new();
    
    for meta in config.profiles {
        let path = dir.join(format!("{}.txt", meta.id));
        let content = if path.exists() {
             fs::read_to_string(&path).unwrap_or_default()
        } else {
             String::new()
        };
        
        profiles.push(ProfileData {
            id: meta.id,
            name: meta.name,
            content,
            active: meta.active,
            folder_id: meta.folder_id,
            url: meta.url,
            last_update: meta.last_update,
            update_interval: meta.update_interval,
        });
    }
    
    Ok(profiles)
}

pub fn list_folders_internal(ctx: &Context) -> Result<Vec<FolderData>, String> {
    let config = load_config_internal(ctx)?;
    let profiles = list_profiles_internal(ctx)?;
    let mut folders = Vec::new();

    for folder in config.folders {
        let folder_profiles = profiles
            .iter()
            .filter(|p| p.folder_id == folder.id)
            .cloned()
            .collect();

        folders.push(FolderData {
            id: folder.id,
            name: folder.name,
            multi_select: folder.multi_select,
            profiles: folder_profiles,
        });
    }

    Ok(folders)
}

#[tauri::command]
pub fn create_profile(
    app: AppHandle,
    name: String,
    folder_id: Option<String>,
    content: Option<String>,
    url: Option<String>,
    update_interval: Option<u64>
) -> Result<String, String> {
    create_profile_internal(&Context::Tauri(&app), name, folder_id, content, url, update_interval)
}

pub fn create_profile_internal(
    ctx: &Context,
    name: String,
    folder_id: Option<String>,
    content: Option<String>,
    url: Option<String>,
    update_interval: Option<u64>
) -> Result<String, String> {
    let mut config = load_config_internal(ctx)?;
    
    // Check for duplicate name
    if config.profiles.iter().any(|p| p.name == name) {
        return Err("环境名称已存在 / Profile name already exists".to_string());
    }

    let target_folder_id = folder_id.unwrap_or_else(default_folder_id);
    if !config.folders.iter().any(|f| f.id == target_folder_id) {
        return Err("Folder not found".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let initial_content = content.unwrap_or_default();
    save_profile_file_internal(ctx, &id, &initial_content)?;
    
    config.profiles.push(ProfileMetadata {
        id: id.clone(),
        name,
        active: false,
        folder_id: target_folder_id,
        url,
        last_update: None,
        update_interval,
    });
    
    save_config_internal(ctx, &config)?;
    Ok(id)
}

#[tauri::command]
pub fn save_profile_content(app: AppHandle, id: String, content: String) -> Result<(), String> {
    let ctx = Context::Tauri(&app);
    save_profile_content_internal(&ctx, &id, &content)?;
    
    // If this profile is active, re-apply config to system hosts
    let config = load_config_internal(&ctx)?;
    if config.profiles.iter().any(|p| p.id == id && p.active) {
        apply_config(app)?;
    }
    Ok(())
}

pub fn save_profile_content_internal(ctx: &Context, id: &str, content: &str) -> Result<(), String> {
    let config = load_config_internal(ctx)?;
    if let Some(profile) = config.profiles.iter().find(|p| p.id == id) {
        if profile.url.is_some() {
            return Err("Remote profile is read-only".to_string());
        }
    } else {
        return Err("Profile not found".to_string());
    }

    save_profile_file_internal(ctx, id, content)
}

#[tauri::command]
pub fn create_folder(app: AppHandle, name: String) -> Result<String, String> {
    create_folder_internal(&Context::Tauri(&app), name)
}

pub fn create_folder_internal(ctx: &Context, name: String) -> Result<String, String> {
    let mut config = load_config_internal(ctx)?;
    if config.folders.iter().any(|f| f.name == name) {
        return Err("文件夹名称已存在 / Folder name already exists".to_string());
    }

    let id = Uuid::new_v4().to_string();
    config.folders.push(FolderMetadata {
        id: id.clone(),
        name,
        multi_select: false,
    });
    save_config_internal(ctx, &config)?;
    Ok(id)
}

#[tauri::command]
pub fn rename_folder(app: AppHandle, id: String, new_name: String) -> Result<(), String> {
    rename_folder_internal(&Context::Tauri(&app), &id, new_name)
}

pub fn rename_folder_internal(ctx: &Context, id: &str, new_name: String) -> Result<(), String> {
    if id == DEFAULT_FOLDER_ID {
        return Err("Default folder cannot be renamed".to_string());
    }

    let mut config = load_config_internal(ctx)?;
    if config.folders.iter().any(|f| f.name == new_name && f.id != id) {
        return Err("文件夹名称已存在 / Folder name already exists".to_string());
    }

    if let Some(folder) = config.folders.iter_mut().find(|f| f.id == id) {
        folder.name = new_name;
        save_config_internal(ctx, &config)?;
        Ok(())
    } else {
        Err("Folder not found".to_string())
    }
}

#[tauri::command]
pub fn reorder_folders(app: AppHandle, ordered_ids: Vec<String>) -> Result<(), String> {
    reorder_folders_internal(&Context::Tauri(&app), ordered_ids)
}

pub fn reorder_folders_internal(ctx: &Context, ordered_ids: Vec<String>) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    if ordered_ids.len() != config.folders.len() {
        return Err("Folder count mismatch".to_string());
    }

    let existing_ids: std::collections::HashSet<String> =
        config.folders.iter().map(|f| f.id.clone()).collect();
    let requested_ids: std::collections::HashSet<String> = ordered_ids.iter().cloned().collect();
    if existing_ids != requested_ids {
        return Err("Folder ids mismatch".to_string());
    }

    let mut by_id = std::collections::HashMap::new();
    for folder in config.folders.drain(..) {
        by_id.insert(folder.id.clone(), folder);
    }

    let mut reordered = Vec::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        if let Some(folder) = by_id.remove(&id) {
            reordered.push(folder);
        } else {
            return Err("Folder not found".to_string());
        }
    }
    config.folders = reordered;
    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn move_profile_to_folder(app: AppHandle, id: String, folder_id: String) -> Result<(), String> {
    move_profile_to_folder_internal(&Context::Tauri(&app), &id, &folder_id)
}

pub fn move_profile_to_folder_internal(ctx: &Context, id: &str, folder_id: &str) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    if !config.folders.iter().any(|f| f.id == folder_id) {
        return Err("Folder not found".to_string());
    }

    if let Some(profile) = config.profiles.iter_mut().find(|p| p.id == id) {
        profile.folder_id = folder_id.to_string();
    } else {
        return Err("Profile not found".to_string());
    }

    if !get_folder_multi_select(&config, folder_id) {
        let mut found = false;
        for profile in config.profiles.iter_mut().filter(|p| p.folder_id == folder_id && p.active) {
            if found {
                profile.active = false;
            } else {
                found = true;
            }
        }
    }

    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> Result<(), String> {
    delete_profile_internal(&Context::Tauri(&app), &id)
}

pub fn delete_profile_internal(ctx: &Context, id: &str) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    
    // Remove from config
    if let Some(idx) = config.profiles.iter().position(|p| p.id == id) {
        config.profiles.remove(idx);
        save_config_internal(ctx, &config)?;
    }
    
    // Delete file
    let dir = get_profiles_dir(ctx)?;
    let path = dir.join(format!("{}.txt", id));
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    
    Ok(())
}

#[tauri::command]
pub fn rename_profile(app: AppHandle, id: String, new_name: String) -> Result<(), String> {
    rename_profile_internal(&Context::Tauri(&app), &id, new_name)
}

pub fn rename_profile_internal(ctx: &Context, id: &str, new_name: String) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    
    // Check for duplicate name (excluding itself)
    if config.profiles.iter().any(|p| p.name == new_name && p.id != id) {
        return Err("环境名称已存在 / Profile name already exists".to_string());
    }

    if let Some(idx) = config.profiles.iter().position(|p| p.id == id) {
        config.profiles[idx].name = new_name;
        save_config_internal(ctx, &config)?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_folder_multi_select(app: AppHandle, folder_id: String, enable: bool) -> Result<(), String> {
    set_folder_multi_select_internal(&Context::Tauri(&app), &folder_id, enable)?;
    apply_config(app)
}

pub fn set_folder_multi_select_internal(ctx: &Context, folder_id: &str, enable: bool) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;

    if let Some(folder) = config.folders.iter_mut().find(|f| f.id == folder_id) {
        folder.multi_select = enable;
    } else {
        return Err("Folder not found".to_string());
    }

    if !enable {
        let mut found = false;
        for profile in config.profiles.iter_mut().filter(|p| p.folder_id == folder_id && p.active) {
            if found {
                profile.active = false;
            } else {
                found = true;
            }
        }
    }

    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn toggle_profile_active(app: AppHandle, id: String) -> Result<(), String> {
    toggle_profile_active_internal(&Context::Tauri(&app), &id)?;
    apply_config(app)
}

pub fn toggle_profile_active_internal(ctx: &Context, id: &str) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;

    let folder_id = config
        .profiles
        .iter()
        .find(|p| p.id == id)
        .map(|p| p.folder_id.clone())
        .ok_or("Profile not found".to_string())?;

    if get_folder_multi_select(&config, &folder_id) {
        if let Some(p) = config.profiles.iter_mut().find(|p| p.id == id) {
            p.active = !p.active;
        }
    } else {
        let was_active = config.profiles.iter().find(|p| p.id == id).map(|p| p.active).unwrap_or(false);

        for p in config.profiles.iter_mut().filter(|p| p.folder_id == folder_id) {
            p.active = false;
        }

        if !was_active {
            if let Some(p) = config.profiles.iter_mut().find(|p| p.id == id) {
                p.active = true;
            }
        }
    }
    
    save_config_internal(ctx, &config)
}

#[tauri::command]
pub fn set_multi_select(app: AppHandle, enable: bool) -> Result<(), String> {
    set_multi_select_internal(&Context::Tauri(&app), enable)?;
    apply_config(app)
}

pub fn set_multi_select_internal(ctx: &Context, enable: bool) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    config.multi_select = enable;
    save_config_internal(ctx, &config)?;
    set_folder_multi_select_internal(ctx, DEFAULT_FOLDER_ID, enable)
}

#[tauri::command]
pub fn apply_config(app: AppHandle) -> Result<(), String> {
    apply_config_internal(&Context::Tauri(&app))
}

pub fn apply_config_internal(ctx: &Context) -> Result<(), String> {
    let config = load_config_internal(ctx)?;
    let common_config = load_common_config_internal(ctx).unwrap_or_default();
    
    let profiles_dir = get_profiles_dir(ctx)?;
    let mut merged_content = String::from("# Generated by Hostly\n\n");
    merged_content.push_str("### Common Config ###\n");
    merged_content.push_str(&common_config);
    merged_content.push_str("\n\n");

    let read_profile = |id: &str| -> String {
        let path = profiles_dir.join(format!("{}.txt", id));
        if path.exists() {
             fs::read_to_string(path).unwrap_or_default()
        } else {
             String::new()
        }
    };

    for profile in config.profiles {
        if profile.active {
            merged_content.push_str(&format!("### Profile: {} ###\n", profile.name));
            merged_content.push_str(&read_profile(&profile.id));
            merged_content.push_str("\n\n");
        }
    }

    crate::hosts::save_system_hosts(merged_content)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FullBackup {
    version: i32,
    timestamp: String,
    config: AppConfig,
    // Support both new (Vec) and old (HashMap) formats for compatibility
    profiles: Option<Vec<ProfileData>>,
    profiles_content: Option<std::collections::HashMap<String, String>>,
}

#[tauri::command]
pub fn import_data(app: AppHandle, json_content: String) -> Result<(), String> {
    import_data_internal(&Context::Tauri(&app), json_content)?;
    apply_config(app)
}

pub fn import_data_internal(ctx: &Context, json_content: String) -> Result<(), String> {
    let backup: FullBackup = serde_json::from_str(&json_content).map_err(|e| e.to_string())?;
    
    // Reset config
    save_config_internal(ctx, &backup.config)?;
    
    // Save each profile (New Version: Vec<ProfileData>)
    if let Some(profiles) = backup.profiles {
        for profile in profiles {
            save_profile_file_internal(ctx, &profile.id, &profile.content)?;
        }
    } 
    // Save each profile (Old Version: HashMap<id, content>)
    else if let Some(profiles_content) = backup.profiles_content {
        for (id, content) in profiles_content {
            save_profile_file_internal(ctx, &id, &content)?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn export_data(app: AppHandle) -> Result<String, String> {
    export_data_internal(&Context::Tauri(&app))
}

pub fn export_data_internal(ctx: &Context) -> Result<String, String> {
    let config = load_config_internal(ctx)?;
    let profiles = list_profiles_internal(ctx)?;
    
    let backup = FullBackup {
        version: 2,
        timestamp: chrono::Local::now().to_rfc3339(),
        config,
        profiles: Some(profiles),
        profiles_content: None,
    };
    
    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

// Helpers for simple file io not needed as much now, but kept for single export if needed
#[tauri::command]
pub fn import_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

// ================= CLI Helpers =================
// These functions are pub but not commands, used by cli.rs
#[tauri::command]
pub fn find_profile_id_by_name(app: AppHandle, name: String) -> Result<Option<String>, String> {
    find_profile_id_by_name_internal(&Context::Tauri(&app), &name)
}

pub fn find_profile_id_by_name_internal(ctx: &Context, name: &str) -> Result<Option<String>, String> {
    let config = load_config_internal(ctx)?;
    Ok(config.profiles.iter().find(|p| p.name == name).map(|p| p.id.clone()))
}

#[tauri::command]
pub fn upsert_profile(app: AppHandle, name: String, content: String) -> Result<String, String> {
    upsert_profile_internal(&Context::Tauri(&app), name, content)
}

pub fn upsert_profile_internal(ctx: &Context, name: String, content: String) -> Result<String, String> {
    upsert_profile_in_folder_internal(ctx, name, content, None)
}

pub fn upsert_profile_in_folder_internal(
    ctx: &Context,
    name: String,
    content: String,
    folder_id: Option<String>,
) -> Result<String, String> {
    if let Some(id) = find_profile_id_by_name_internal(ctx, &name)? {
        save_profile_file_internal(ctx, &id, &content)?;
        Ok(id)
    } else {
        create_profile_internal(ctx, name, folder_id, Some(content), None, None)
    }
}

#[tauri::command]
pub fn import_switchhosts(app: AppHandle, json_content: String) -> Result<usize, String> {
    let ctx = Context::Tauri(&app);
    let count = import_switchhosts_internal(&ctx, json_content)?;
    apply_config(app)?;
    Ok(count)
}

pub fn import_switchhosts_internal(ctx: &Context, json_content: String) -> Result<usize, String> {
    let raw: serde_json::Value = serde_json::from_str(&json_content).map_err(|e| format!("Invalid JSON: {}", e))?;
    
    // SwitchHosts v4+ format: data.list.tree (structure) + data.collection.hosts.data (content)
    if let Some(data) = raw.get("data") {
        let mut content_map = std::collections::HashMap::new();
        
        // Build ID -> Content map
        if let Some(hosts_data) = data.get("collection")
            .and_then(|c| c.get("hosts"))
            .and_then(|h| h.get("data"))
            .and_then(|d| d.as_array()) 
        {
            for h in hosts_data {
                if let (Some(id), Some(content)) = (h.get("id").and_then(|v| v.as_str()), h.get("content").and_then(|v| v.as_str())) {
                    content_map.insert(id, content);
                }
            }
        }

        // Traverse tree
        if let Some(tree) = data.get("list").and_then(|l| l.get("tree")).and_then(|t| t.as_array()) {
            let mut count = 0;
            parse_switchhosts_v4_tree_internal(ctx, tree, &content_map, None, &mut count)?;
            return Ok(count);
        }
    }

    // Fallback to simpler format (v1-v3 or simpler exports)
    let list = if let Some(l) = raw.get("list") {
        l.as_array().ok_or("Invalid SwitchHosts format: 'list' is not an array")?
    } else if raw.is_array() {
        raw.as_array().unwrap()
    } else {
        return Err("Invalid SwitchHosts format: Expected SH v4 structure or a simple array".to_string());
    };

    let mut count = 0;
    parse_switchhosts_items_internal(ctx, list, None, &mut count)?;

    Ok(count)
}

fn parse_switchhosts_v4_tree_internal(
    ctx: &Context, 
    items: &Vec<serde_json::Value>, 
    content_map: &std::collections::HashMap<&str, &str>, 
    root_folder_id: Option<String>,
    count: &mut usize
) -> Result<(), String> {
    for item in items {
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("local");
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");

        if item_type == "folder" {
            let next_root_folder_id = if let Some(existing_root) = &root_folder_id {
                existing_root.clone()
            } else {
                get_or_create_folder_by_name_internal(ctx, title)?
            };
            if let Some(children) = item.get("children").and_then(|c| c.as_array()) {
                parse_switchhosts_v4_tree_internal(ctx, children, content_map, Some(next_root_folder_id), count)?;
            }
        } else {
            // Find content in map or item itself
            let content = content_map.get(id).map(|c| *c).or_else(|| item.get("content").and_then(|v| v.as_str())).unwrap_or("");
            upsert_profile_in_folder_internal(ctx, title.to_string(), content.to_string(), root_folder_id.clone())?;
            *count += 1;
        }
    }
    Ok(())
}

fn parse_switchhosts_items_internal(
    ctx: &Context,
    items: &Vec<serde_json::Value>,
    root_folder_id: Option<String>,
    count: &mut usize,
) -> Result<(), String> {
    for item in items {
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let folder = is_switchhosts_folder_item(item);
        
        if folder {
            let next_root_folder_id = if let Some(existing_root) = &root_folder_id {
                existing_root.clone()
            } else {
                get_or_create_folder_by_name_internal(ctx, title)?
            };
            if let Some(children) = item.get("children").and_then(|c| c.as_array()) {
                parse_switchhosts_items_internal(ctx, children, Some(next_root_folder_id), count)?;
            }
        } else {
            let content = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
            upsert_profile_in_folder_internal(ctx, title.to_string(), content.to_string(), root_folder_id.clone())?;
            *count += 1;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_ctx() -> (tempfile::TempDir, Context<'static>) {
        let dir = tempdir().expect("failed to create temp dir");
        let app_dir = dir.path().join("com.hostly.switcher");
        (dir, Context::HeadlessAt(app_dir))
    }

    #[test]
    fn import_switchhosts_v3_folder_mode_keeps_top_folder() {
        let (_guard, ctx) = test_ctx();
        let json = r#"
{
  "version": [3, 5, 6, 5551],
  "list": [
    {
      "id": "folder-root",
      "title": "Root Folder",
      "folder_mode": 1,
      "children": [
        {
          "id": "folder-child",
          "title": "Child Folder",
          "folder_mode": 1,
          "children": [
            {
              "id": "a",
              "title": "A",
              "content": "127.0.0.1 a.local"
            }
          ]
        },
        {
          "id": "b",
          "title": "B",
          "content": "127.0.0.1 b.local"
        }
      ]
    },
    {
      "id": "c",
      "title": "C",
      "content": "127.0.0.1 c.local"
    }
  ]
}
        "#;

        let imported = import_switchhosts_internal(&ctx, json.to_string()).expect("import should succeed");
        assert_eq!(imported, 3);

        let folders = list_folders_internal(&ctx).expect("list folders should succeed");
        let root = folders
            .iter()
            .find(|f| f.name == "Root Folder")
            .expect("top-level folder should be created");

        let root_names: std::collections::HashSet<String> =
            root.profiles.iter().map(|p| p.name.clone()).collect();
        assert!(root_names.contains("A"));
        assert!(root_names.contains("B"));
        assert_eq!(root_names.len(), 2);

        let default = folders
            .iter()
            .find(|f| f.id == DEFAULT_FOLDER_ID)
            .expect("default folder should exist");
        assert!(default.profiles.iter().any(|p| p.name == "C"));
    }

    #[test]
    fn import_switchhosts_v4_tree_keeps_top_folder() {
        let (_guard, ctx) = test_ctx();
        let json = r#"
{
  "data": {
    "list": {
      "tree": [
        {
          "id": "folder-root",
          "type": "folder",
          "title": "Top",
          "children": [
            {
              "id": "folder-child",
              "type": "folder",
              "title": "Nested",
              "children": [
                { "id": "host-1", "type": "local", "title": "One" }
              ]
            },
            { "id": "host-2", "type": "local", "title": "Two" }
          ]
        }
      ]
    },
    "collection": {
      "hosts": {
        "data": [
          { "id": "host-1", "content": "127.0.0.1 one.local" },
          { "id": "host-2", "content": "127.0.0.1 two.local" }
        ]
      }
    }
  }
}
        "#;

        let imported = import_switchhosts_internal(&ctx, json.to_string()).expect("import should succeed");
        assert_eq!(imported, 2);

        let folders = list_folders_internal(&ctx).expect("list folders should succeed");
        let top = folders.iter().find(|f| f.name == "Top").expect("top folder should exist");
        let top_names: std::collections::HashSet<String> =
            top.profiles.iter().map(|p| p.name.clone()).collect();
        assert!(top_names.contains("One"));
        assert!(top_names.contains("Two"));
        assert_eq!(top_names.len(), 2);
    }
}

pub fn check_auto_updates(app: &AppHandle) {
    let ctx = Context::Tauri(app);
    // Silent check, allow errors to just print to stderr
    if let Ok(config) = load_config_internal(&ctx) {
        let now = chrono::Local::now();
        let mut needs_save = false;
        
        // Collect IDs to update to avoid borrow checker issues with iterating & mutating config
        let mut updates_needed = Vec::new();

        for p in &config.profiles {
            if let (Some(_url), Some(interval), Some(last_update_str)) = (&p.url, p.update_interval, &p.last_update) {
                if interval > 0 {
                    if let Ok(last_update) = chrono::DateTime::parse_from_rfc3339(last_update_str) {
                        let diff = now.signed_duration_since(last_update);
                        if diff.num_seconds() >= interval as i64 {
                            updates_needed.push(p.id.clone());
                        }
                    }
                }
            } else if let (Some(_url), Some(interval), None) = (&p.url, p.update_interval, &p.last_update) {
                // Never updated, but has interval -> update now
                 if interval > 0 {
                    updates_needed.push(p.id.clone());
                 }
            }
        }
        
        for id in updates_needed {
            println!("Auto-updating profile {}...", id);
            if let Err(e) = trigger_profile_update_internal(&ctx, &id) {
                eprintln!("Failed to auto-update {}: {}", id, e);
            }
            // re-application is handled inside trigger_profile_update_internal? 
            // implementation_plan said Trigger triggers re-apply. 
            // Actually `trigger_profile_update` command does, but `internal` does NOT re-apply.
            // We should reload config to check if active and apply if needed?
            // checking internal implementation...
            // `trigger_profile_update_internal` saves file and updates timestamp in config.
            // It does NOT call apply_config.
            // So we need to do it here if any update happened.
            needs_save = true;
        }

        if needs_save {
             // Re-apply config if any active profile was updated
             // Optimization: check if any updated profile was active
             // For now, just apply to be safe
             let _ = apply_config_internal(&ctx);
        }
    }
}

#[tauri::command]
pub fn update_remote_config(
    app: AppHandle,
    id: String,
    url: Option<String>,
    update_interval: Option<u64>
) -> Result<(), String> {
    let ctx = Context::Tauri(&app);
    let mut config = load_config_internal(&ctx)?;
    
    if let Some(p) = config.profiles.iter_mut().find(|p| p.id == id) {
        p.url = url;
        p.update_interval = update_interval;
    } else {
        return Err("Profile not found".to_string());
    }

    save_config_internal(&ctx, &config)
}

#[tauri::command]
pub fn trigger_profile_update(app: AppHandle, id: String) -> Result<(), String> {
    let ctx = Context::Tauri(&app);
    trigger_profile_update_internal(&ctx, &id)?;
    // If active, re-apply
    let config = load_config_internal(&ctx)?;
    if config.profiles.iter().any(|p| p.id == id && p.active) {
        apply_config(app)?;
    }
    Ok(())
}

pub fn trigger_profile_update_internal(ctx: &Context, id: &str) -> Result<(), String> {
    let mut config = load_config_internal(ctx)?;
    
    let (url, name) = if let Some(p) = config.profiles.iter().find(|p| p.id == id) {
        (p.url.clone(), p.name.clone())
    } else {
        return Err("Profile not found".to_string());
    };

    let url = url.ok_or("Profile is not a remote profile (no URL)")?;
    
    // Download
    println!("Downloading profile '{}' from '{}'...", name, url);
    let content = download_text(&url)?;

    // Save Content
    save_profile_file_internal(ctx, id, &content)?;

    // Update Timestamp
    if let Some(p) = config.profiles.iter_mut().find(|p| p.id == id) {
        p.last_update = Some(chrono::Local::now().to_rfc3339());
    }
    save_config_internal(ctx, &config)?;
    
    Ok(())
}

fn download_text(urls_str: &str) -> Result<String, String> {
    let mut combined_content = String::new();
    let urls: Vec<&str> = urls_str.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

    if urls.is_empty() {
        return Err("No valid URLs provided".to_string());
    }

    for url in urls {
        let content = download_single_url(url)?;
        if !combined_content.is_empty() {
            combined_content.push_str("\n\n");
        }
        combined_content.push_str(&format!("# Source: {}\n", url));
        combined_content.push_str(&content);
    }

    Ok(combined_content)
}

fn download_single_url(url: &str) -> Result<String, String> {
    let response = minreq::get(url)
        .with_timeout(10)
        .send()
        .map_err(|e| format!("Network error downloading {}: {}", url, e))?;
        
    if response.status_code >= 200 && response.status_code < 300 {
        response.as_str().map(|s| s.to_string()).map_err(|e| format!("Invalid text encoding from {}: {}", url, e))
    } else {
        Err(format!("HTTP Error {} from {}", response.status_code, url))
    }
}
