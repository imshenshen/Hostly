mod hosts;
pub mod storage;
pub mod cli;

#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;
use tauri::Manager;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Check CLI args
            if cli::run_cli(Some(&app.handle())) {
                std::process::exit(0);
            }

            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            {
                let _ = apply_mica(&window, Some(true));
            }
            
            // Apply Window Settings
            let ctx = storage::Context::Tauri(&app.handle());
            if let Ok(config) = storage::load_config_internal(&ctx) {
                if let (Some(w), Some(h)) = (config.window_width, config.window_height) {
                     let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: w, height: h }));
                }
            }
            
            // Show window after setup to prevent flashing/resizing jitter
            // create generic show_Window to calling from frontend
            // window.show().unwrap();
            // window.set_focus().unwrap();
            
            // Background Scheduler
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait for app to startup
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    storage::check_auto_updates(&handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hosts::get_system_hosts,
            hosts::save_system_hosts,
            hosts::check_write_permission,
            hosts::hostly_open_url,
            storage::load_config,
            storage::load_common_config,
            storage::save_common_config,
            storage::list_profiles,
            storage::create_profile,
            storage::create_folder,
            storage::rename_folder,
            storage::reorder_folders,
            storage::save_profile_content,
            storage::delete_profile,
            storage::rename_profile,
            storage::move_profile_to_folder,
            storage::toggle_profile_active,
            storage::set_multi_select,
            storage::set_folder_multi_select,
            storage::apply_config,
            storage::import_file,
            storage::export_file,
            storage::import_data,
            storage::export_data,
            storage::import_switchhosts,
            storage::update_remote_config,
            storage::trigger_profile_update,
            storage::set_theme,
            storage::save_window_config,
            storage::save_sidebar_config,
            show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn show_main_window(window: tauri::Window) {
    window.show().unwrap();
    window.set_focus().unwrap();
}
