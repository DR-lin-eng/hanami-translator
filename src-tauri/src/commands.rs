use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::{
    credentials,
    domain::{ApiMode, ApiSettings, ProcessPageRequest, ProcessPageResult, SourceAsset},
    importer,
    openai::OpenAiClient,
    pipeline,
    processing::ProcessingState,
};

#[tauri::command]
pub async fn import_paths(app: AppHandle, paths: Vec<String>) -> Result<Vec<SourceAsset>, String> {
    importer::import_paths(&app, paths)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub fn load_demo_asset(app: AppHandle) -> Result<SourceAsset, String> {
    importer::load_demo_asset(&app).map_err(Into::into)
}

#[tauri::command]
pub async fn process_page(
    app: AppHandle,
    state: State<'_, ProcessingState>,
    job_id: String,
    request: ProcessPageRequest,
) -> Result<ProcessPageResult, String> {
    pipeline::process_page(&app, request, state.token(&job_id))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub fn start_processing(state: State<'_, ProcessingState>, job_id: String) {
    state.start(job_id);
}

#[tauri::command]
pub fn cancel_processing(state: State<'_, ProcessingState>, job_id: String) {
    state.cancel(&job_id);
}

#[tauri::command]
pub fn finish_processing(state: State<'_, ProcessingState>, job_id: String) {
    state.finish(&job_id);
}

#[tauri::command]
pub fn save_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    credentials::save_api_key(&app, &api_key).map_err(Into::into)
}

#[tauri::command]
pub fn delete_api_key(app: AppHandle) -> Result<(), String> {
    credentials::delete_api_key(&app).map_err(Into::into)
}

#[tauri::command]
pub fn api_key_configured(app: AppHandle) -> bool {
    credentials::has_api_key(&app)
}

#[tauri::command]
pub async fn test_api_connection(app: AppHandle, settings: ApiSettings) -> Result<(), String> {
    let key = credentials::load_api_key(&app).map_err(String::from)?;
    let client = OpenAiClient::new(key, &settings.api_base).map_err(String::from)?;
    client
        .check_model(&settings.image_model)
        .await
        .map_err(String::from)?;
    if settings.api_mode == ApiMode::Responses {
        client
            .check_model(&settings.responses_model)
            .await
            .map_err(String::from)?;
    }
    Ok(())
}

#[tauri::command]
pub fn write_output(path: String, data_url: String) -> Result<(), String> {
    pipeline::write_data_url(&PathBuf::from(path), &data_url).map_err(Into::into)
}
