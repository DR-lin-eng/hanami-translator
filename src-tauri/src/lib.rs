mod commands;
mod credentials;
mod domain;
mod error;
mod importer;
mod openai;
mod pipeline;
mod privacy;
mod processing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(processing::ProcessingState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::import_paths,
            commands::load_demo_asset,
            commands::process_page,
            commands::start_processing,
            commands::cancel_processing,
            commands::finish_processing,
            commands::save_api_key,
            commands::delete_api_key,
            commands::api_key_configured,
            commands::test_api_connection,
            commands::write_output,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Hanami Translator");
}
