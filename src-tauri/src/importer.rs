use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use pdfium_bundled::pdfium_render::prelude::*;
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    domain::{SourceAsset, SourceKind},
    error::{AppError, AppResult},
};

const MAX_PREVIEW_BYTES: u64 = 80 * 1024 * 1024;
const PDF_RENDER_DPI: f32 = 160.0;
const PDF_POINTS_PER_INCH: f32 = 72.0;

// pdfium-bundled extracts its embedded dylib on first use. Keep that one-time
// operation atomic when separate import commands arrive at the same time.
static PDFIUM_BIND_LOCK: Mutex<()> = Mutex::new(());

pub async fn import_paths(app: &AppHandle, paths: Vec<String>) -> AppResult<Vec<SourceAsset>> {
    let mut images = Vec::new();
    let mut pdfs = Vec::new();

    for raw_path in paths {
        let path = PathBuf::from(raw_path);
        if path.is_dir() {
            for entry in WalkDir::new(&path)
                .follow_links(false)
                .into_iter()
                .filter_map(Result::ok)
            {
                let candidate = entry.into_path();
                if is_image(&candidate) {
                    images.push(candidate);
                } else if is_pdf(&candidate) {
                    pdfs.push(candidate);
                }
            }
        } else if is_image(&path) {
            images.push(path);
        } else if is_pdf(&path) {
            pdfs.push(path);
        }
    }

    images.sort();
    pdfs.sort();

    let mut assets = Vec::new();
    for path in images {
        assets.push(read_image_asset(&path, SourceKind::Image, None)?);
    }
    for path in pdfs {
        assets.extend(render_pdf(app, &path).await?);
    }

    if assets.is_empty() {
        return Err(AppError::Message("没有找到支持的图片或 PDF 文件".into()));
    }
    Ok(assets)
}

pub fn load_demo_asset(app: &AppHandle) -> AppResult<SourceAsset> {
    let bundled = app
        .path()
        .resolve(
            "resources/demo-manga.png",
            tauri::path::BaseDirectory::Resource,
        )
        .ok();
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/demo-manga.png");
    let path = bundled.filter(|path| path.exists()).unwrap_or(development);
    read_image_asset(&path, SourceKind::Demo, Some(1))
}

fn read_image_asset(
    path: &Path,
    kind: SourceKind,
    page_number: Option<u32>,
) -> AppResult<SourceAsset> {
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_PREVIEW_BYTES {
        return Err(AppError::Message(format!(
            "文件过大，无法载入预览：{}",
            path.display()
        )));
    }
    let (width, height) = image::image_dimensions(path)?;
    let bytes = fs::read(path)?;
    let mime = mime_for_path(path);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名图片")
        .to_owned();

    Ok(SourceAsset {
        id: Uuid::new_v4().to_string(),
        name,
        source_kind: kind,
        path: path.to_string_lossy().into_owned(),
        data_url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        width,
        height,
        page_number,
    })
}

async fn render_pdf(app: &AppHandle, pdf_path: &Path) -> AppResult<Vec<SourceAsset>> {
    let app_cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::Message(format!("无法定位缓存目录：{error}")))?;
    let cache_root = app_cache_root
        .join("pdf-pages")
        .join(Uuid::new_v4().to_string());
    let pdfium_cache_root = app_cache_root.join("pdfium");
    fs::create_dir_all(&cache_root)?;

    let owned_pdf_path = pdf_path.to_owned();
    let owned_cache_root = cache_root.clone();
    let render_result = tokio::task::spawn_blocking(move || {
        render_pdf_with_pdfium(&owned_pdf_path, &owned_cache_root, &pdfium_cache_root)
    })
    .await;

    match render_result {
        Ok(Ok(assets)) => Ok(assets),
        Ok(Err(error)) => {
            let _ = fs::remove_dir_all(&cache_root);
            Err(error)
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&cache_root);
            Err(AppError::Message(format!("PDF 渲染任务异常终止：{error}")))
        }
    }
}

fn render_pdf_with_pdfium(
    pdf_path: &Path,
    cache_root: &Path,
    pdfium_cache_root: &Path,
) -> AppResult<Vec<SourceAsset>> {
    fs::create_dir_all(cache_root)?;
    let pdfium = {
        let _bind_guard = PDFIUM_BIND_LOCK
            .lock()
            .map_err(|_| AppError::Message("PDF 渲染器初始化锁已损坏".into()))?;
        std::env::set_var("PDFIUM_BUNDLED_CACHE_DIR", pdfium_cache_root);
        pdfium_bundled::bind_bundled()
            .map_err(|error| AppError::Message(format!("无法初始化内置 PDF 渲染器：{error}")))?
    };
    let document = pdfium
        .load_pdf_from_file(pdf_path, None)
        .map_err(|error| AppError::Message(format!("PDF 解析失败：{error}")))?;

    if document.pages().len() == 0 {
        return Err(AppError::Message("PDF 中没有可渲染的页面".into()));
    }

    let render_config = PdfRenderConfig::new()
        .scale_page_by_factor(PDF_RENDER_DPI / PDF_POINTS_PER_INCH)
        .render_form_data(true)
        .render_annotations(true);
    let mut assets = Vec::with_capacity(document.pages().len() as usize);

    for (page_index, page) in document.pages().iter().enumerate() {
        let page_number = (page_index + 1) as u32;
        let page_path = pdf_page_path(cache_root, page_number);
        page.render_with_config(&render_config)
            .map_err(|error| {
                AppError::Message(format!("PDF 第 {page_number} 页渲染失败：{error}"))
            })?
            .as_image()
            .map_err(|error| {
                AppError::Message(format!("PDF 第 {page_number} 页图片转换失败：{error}"))
            })?
            .save_with_format(&page_path, image::ImageFormat::Png)?;
        assets.push(read_image_asset(
            &page_path,
            SourceKind::PdfPage,
            Some(page_number),
        )?);
    }

    Ok(assets)
}

fn pdf_page_path(cache_root: &Path, page_number: u32) -> PathBuf {
    cache_root.join(format!("page-{page_number:04}.png"))
}

fn is_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp" | "gif")
    )
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
}

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "image/png",
    }
}

#[cfg(test)]
mod tests {
    use super::{pdf_page_path, render_pdf_with_pdfium};
    use std::path::Path;

    #[test]
    fn pdf_page_names_sort_in_numeric_order() {
        let root = Path::new("cache");
        let mut pages = (1..=120)
            .map(|page_number| pdf_page_path(root, page_number))
            .collect::<Vec<_>>();
        pages.reverse();
        pages.sort();

        for (index, path) in pages.iter().enumerate() {
            assert_eq!(
                path.file_name().and_then(|name| name.to_str()),
                Some(format!("page-{:04}.png", index + 1).as_str())
            );
        }
    }

    #[test]
    #[ignore = "set HANAMI_PDF_TEST_PATH to run the real PDFium rendering test"]
    fn renders_real_pdf_in_source_page_order() {
        let pdf_path = std::env::var("HANAMI_PDF_TEST_PATH")
            .expect("HANAMI_PDF_TEST_PATH must point to a PDF fixture");
        let output = tempfile::tempdir().expect("create PDF rendering output directory");
        let assets = render_pdf_with_pdfium(
            Path::new(&pdf_path),
            &output.path().join("pages"),
            &output.path().join("pdfium"),
        )
        .expect("render PDF with embedded PDFium");

        assert!(!assets.is_empty());
        for (index, asset) in assets.iter().enumerate() {
            let page_number = (index + 1) as u32;
            assert_eq!(asset.page_number, Some(page_number));
            assert!(asset.width > 0);
            assert!(asset.height > 0);
            assert_eq!(
                Path::new(&asset.path)
                    .file_name()
                    .and_then(|name| name.to_str()),
                Some(format!("page-{page_number:04}.png").as_str())
            );
        }
    }
}
