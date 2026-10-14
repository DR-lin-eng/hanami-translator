use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use tauri::{AppHandle, Manager};

use crate::{
    credentials,
    domain::{ApiMode, ProcessPageRequest, ProcessPageResult},
    error::{AppError, AppResult},
    openai::{ImageEditOptions, OpenAiClient},
    privacy,
    processing::CancellationToken,
};

pub async fn process_page(
    app: &AppHandle,
    request: ProcessPageRequest,
    cancellation: Arc<CancellationToken>,
) -> AppResult<ProcessPageResult> {
    if cancellation.is_cancelled() {
        return Err(AppError::Message("任务已中断".into()));
    }
    let path = PathBuf::from(&request.path);
    if !path.is_file() {
        return Err(AppError::Message("待处理图片不存在".into()));
    }

    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::Message(format!("无法定位缓存目录：{error}")))?
        .join("image-edit-jobs");
    let artifacts = privacy::create_privacy_artifacts(&path, &request.regions, &cache_root)?;
    let api_key = credentials::load_api_key(app)?;
    let client = OpenAiClient::new(api_key, &request.api_base)?;
    let output_size = crate::openai::image_output_size(
        &request.image_model,
        artifacts.image_width,
        artifacts.image_height,
    );
    let edit_request = client.edit_image(ImageEditOptions {
        api_mode: request.api_mode,
        responses_model: &request.responses_model,
        model: &request.image_model,
        quality: &request.quality,
        size: &output_size,
        image_path: &artifacts.image_path,
        mask_path: artifacts.mask_path.as_deref(),
        source_language: &request.source_language,
        target_language: &request.target_language,
        page_type: &request.page_type,
        additional_instructions: &request.additional_instructions,
        isolates_text_regions: artifacts.text_region_count > 0,
        protects_privacy_regions: artifacts.privacy_region_count > 0,
    });
    tokio::pin!(edit_request);
    let generated_image_data_url = tokio::select! {
        biased;
        _ = cancellation.cancelled() => return Err(AppError::Message("任务已中断".into())),
        result = &mut edit_request => result?,
    };

    let api_name = match request.api_mode {
        ApiMode::Images => "Images API",
        ApiMode::Responses => "Responses API",
    };
    let note = match (artifacts.text_region_count, artifacts.privacy_region_count) {
        (0, 0) => format!("已通过 {api_name} 完成整页翻译嵌字"),
        (0, private) => format!("已完成整页翻译；{private} 个隐私区域未上传并将在导出时从原图回填"),
        (text, 0) => format!("已隔离上传并完成 {text} 个指定文字区域的翻译嵌字"),
        (text, private) => {
            format!("已隔离上传 {text} 个文字区域；{private} 个隐私区域未上传并将在导出时回填")
        }
    };

    Ok(ProcessPageResult {
        generated_image_data_url,
        note,
        privacy_restore_padding: artifacts.privacy_restore_padding,
    })
}

pub fn write_data_url(path: &Path, data_url: &str) -> AppResult<()> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| AppError::Message("导出数据格式不正确".into()))?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|error| AppError::Message(format!("导出数据解码失败：{error}")))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes)?;
    Ok(())
}
