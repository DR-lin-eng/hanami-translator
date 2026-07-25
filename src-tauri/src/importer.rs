use std::{
    fs,
    path::{Path, PathBuf},
    process::Stdio,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    domain::{SourceAsset, SourceKind},
    error::{AppError, AppResult},
};

const MAX_PREVIEW_BYTES: u64 = 80 * 1024 * 1024;

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
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::Message(format!("无法定位缓存目录：{error}")))?
        .join("pdf-pages")
        .join(Uuid::new_v4().to_string());
    fs::create_dir_all(&cache_root)?;
    let prefix = cache_root.join("page");
    let executable = resolve_pdftoppm();

    let output = Command::new(&executable)
        .arg("-png")
        .arg("-r")
        .arg("160")
        .arg(pdf_path)
        .arg(&prefix)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|error| AppError::Message(format!("无法启动 PDF 渲染器 {executable}：{error}")))?;

    if !output.status.success() {
        return Err(AppError::Message(format!(
            "PDF 解析失败。请确认已安装 Poppler（pdftoppm）。{}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let mut pages: Vec<PathBuf> = fs::read_dir(&cache_root)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| is_image(path))
        .collect();
    pages.sort();

    pages
        .iter()
        .enumerate()
        .map(|(index, path)| read_image_asset(path, SourceKind::PdfPage, Some((index + 1) as u32)))
        .collect()
}

fn resolve_pdftoppm() -> String {
    for candidate in [
        "/opt/homebrew/bin/pdftoppm",
        "/usr/local/bin/pdftoppm",
        "/usr/bin/pdftoppm",
    ] {
        if Path::new(candidate).exists() {
            return candidate.to_owned();
        }
    }
    "pdftoppm".to_owned()
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
