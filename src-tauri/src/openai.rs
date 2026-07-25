use std::{fs, path::Path, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{
    multipart::{Form, Part},
    Client,
};
use serde_json::Value;

use crate::error::{AppError, AppResult};

pub struct OpenAiClient {
    client: Client,
    api_key: String,
    api_base: String,
}

pub struct ImageEditOptions<'a> {
    pub model: &'a str,
    pub quality: &'a str,
    pub size: &'a str,
    pub image_path: &'a Path,
    pub mask_path: Option<&'a Path>,
    pub source_language: &'a str,
    pub target_language: &'a str,
    pub page_type: &'a str,
    pub additional_instructions: &'a str,
    pub isolates_text_regions: bool,
    pub protects_privacy_regions: bool,
}

impl OpenAiClient {
    pub fn new(api_key: String, api_base: &str) -> AppResult<Self> {
        let api_base = validate_api_base(api_base)?;
        let client = Client::builder()
            .timeout(Duration::from_secs(360))
            .user_agent("hanami-translator/0.1.0")
            .build()?;
        Ok(Self {
            client,
            api_key,
            api_base,
        })
    }

    pub async fn check_model(&self, model: &str) -> AppResult<()> {
        let response = self
            .client
            .get(format!("{}/models/{}", self.api_base, model))
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        let value = parse_json_response(ensure_success(response).await?).await?;
        if value.get("id").and_then(Value::as_str).is_none()
            && value.get("object").and_then(Value::as_str).is_none()
        {
            return Err(AppError::Message(
                "模型接口返回了 JSON，但不包含模型对象".into(),
            ));
        }
        Ok(())
    }

    pub async fn edit_image(&self, options: ImageEditOptions<'_>) -> AppResult<String> {
        let scope = match (
            options.isolates_text_regions,
            options.protects_privacy_regions,
        ) {
            (true, true) => "Only selected text regions are visible. Translate and change only the transparent mask areas. Keep every neutral or opaque area unchanged and never reconstruct the protected content.",
            (true, false) => "Only selected text regions are visible. Translate and change only the transparent mask areas. Ignore the neutral background and keep it unchanged.",
            (false, true) => "Translate readable text only in the transparent mask areas. Neutral opaque areas are intentional privacy redactions: keep them unchanged and never infer, reconstruct, or replace their hidden content.",
            (false, false) => "Translate all readable source-language text on the page.",
        };
        let extra = options.additional_instructions.trim();
        let prompt = format!(
            "Use case: text-localization\nAsset type: {}\nPrimary request: identify the visible {} text, translate it accurately into {}, remove the original lettering, and typeset the translation naturally in the same location.\n{}\nPlacement: keep every replacement inside its original transparent mask region with the same center, orientation, reading direction, and visual scale. Never move text into another region.\nConstraints: preserve panel layout, speech bubbles, illustrations, faces, colors, textures, logos, and non-text details outside protected neutral areas. Keep reading order and tone. Never reconstruct protected or missing content. Do not summarize, add captions, invent dialogue, add watermarks, or redesign the artwork. Return one finished localized page.{}",
            options.page_type,
            options.source_language,
            options.target_language,
            scope,
            if extra.is_empty() { String::new() } else { format!("\nAdditional instructions: {extra}") },
        );
        let image_bytes = fs::read(options.image_path)?;
        let mut form = Form::new()
            .text("model", options.model.to_owned())
            .text("quality", normalize_quality(options.quality).to_owned())
            .text("size", options.size.to_owned())
            .text("prompt", prompt)
            .part(
                "image[]",
                Part::bytes(image_bytes)
                    .file_name("page.png")
                    .mime_str("image/png")?,
            );
        if let Some(mask_path) = options.mask_path {
            form = form.part(
                "mask",
                Part::bytes(fs::read(mask_path)?)
                    .file_name("mask.png")
                    .mime_str("image/png")?,
            );
        }

        let response = self
            .client
            .post(format!("{}/images/edits", self.api_base))
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await?;
        let value = parse_json_response(ensure_success(response).await?).await?;
        let encoded = value
            .get("data")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|item| item.get("b64_json"))
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Message("图像编辑接口未返回图片数据".into()))?;
        STANDARD
            .decode(encoded)
            .map_err(|error| AppError::Message(format!("图像结果解码失败：{error}")))?;
        Ok(format!("data:image/png;base64,{encoded}"))
    }
}

pub fn image_output_size(model: &str, width: u32, height: u32) -> String {
    if model.trim().eq_ignore_ascii_case("gpt-image-2") {
        let ratio = (width.max(1) as f64 / height.max(1) as f64).clamp(1.0 / 3.0, 3.0);
        let source_pixels = width.max(1) as f64 * height.max(1) as f64;
        let target_pixels = source_pixels.clamp(655_360.0, 3_686_400.0);
        let target_height = (target_pixels / ratio).sqrt();
        let target_width = target_height * ratio;
        let aligned_width = align_dimension(target_width);
        let aligned_height = align_dimension(target_height);
        format!("{aligned_width}x{aligned_height}")
    } else if width > height.saturating_mul(6) / 5 {
        "1536x1024".into()
    } else if height > width.saturating_mul(6) / 5 {
        "1024x1536".into()
    } else {
        "1024x1024".into()
    }
}

fn align_dimension(value: f64) -> u32 {
    ((value / 16.0).ceil().clamp(1.0, 240.0) as u32) * 16
}

fn validate_api_base(value: &str) -> AppResult<String> {
    let trimmed = value.trim().trim_end_matches('/');
    let mut parsed = reqwest::Url::parse(trimmed)
        .map_err(|error| AppError::Message(format!("API 地址格式不正确：{error}")))?;
    let is_loopback = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"));
    let allowed = parsed.scheme() == "https" || (parsed.scheme() == "http" && is_loopback);
    if !allowed {
        return Err(AppError::Message(
            "API 地址必须使用 HTTPS；仅本机地址允许 HTTP".into(),
        ));
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(AppError::Message("API 地址不能包含查询参数或片段".into()));
    }
    let normalized_path = parsed
        .path()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/");
    parsed.set_path(&format!("/{normalized_path}"));
    Ok(parsed.as_str().trim_end_matches('/').to_owned())
}

fn normalize_quality(value: &str) -> &'static str {
    match value {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        _ => "auto",
    }
}

async fn ensure_success(response: reqwest::Response) -> AppResult<reqwest::Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown")
        .to_owned();
    let body = response.text().await.unwrap_or_default();
    let message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| body.chars().take(400).collect());
    Err(AppError::Message(format!(
        "OpenAI API {status}：{message}（request_id: {request_id}）"
    )))
}

async fn parse_json_response(response: reqwest::Response) -> AppResult<Value> {
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown")
        .to_owned();
    if !content_type.to_ascii_lowercase().contains("json") {
        let preview: String = response
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(120)
            .collect();
        return Err(AppError::Message(format!(
            "API 返回了非 JSON 内容（Content-Type: {content_type}）：{preview}"
        )));
    }
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests {
    use std::{env, fs, path::PathBuf};

    use base64::{engine::general_purpose::STANDARD, Engine};
    use image::{imageops, RgbaImage};

    use super::{image_output_size, validate_api_base, ImageEditOptions, OpenAiClient};
    use crate::{
        domain::{MaskKind, MaskRegion, NormalizedRect},
        privacy::create_privacy_artifacts,
    };

    #[test]
    fn accepts_https_and_loopback_only() {
        assert!(validate_api_base("https://api.openai.com/v1/").is_ok());
        assert!(validate_api_base("http://127.0.0.1:8080/v1").is_ok());
        assert!(validate_api_base("http://example.com/v1").is_err());
    }

    #[test]
    fn normalizes_duplicate_path_separators() {
        assert_eq!(
            validate_api_base("https://www.xiaobaishu.org//v1").unwrap(),
            "https://www.xiaobaishu.org/v1"
        );
    }

    #[test]
    fn gpt_image_2_size_preserves_the_source_aspect_ratio() {
        assert_eq!(image_output_size("gpt-image-2", 1400, 1900), "1408x1904");
        assert_eq!(image_output_size("gpt-image-2", 400, 400), "816x816");
    }

    #[test]
    fn legacy_models_use_supported_popular_sizes() {
        assert_eq!(image_output_size("gpt-image-1", 1400, 1900), "1024x1536");
        assert_eq!(image_output_size("gpt-image-1", 1900, 1400), "1536x1024");
    }

    #[tokio::test]
    #[ignore = "uses the saved API key and makes a billable Images API request"]
    async fn live_text_region_edit_preserves_every_pixel_outside_the_region() {
        let source_path = PathBuf::from(
            env::var("HANAMI_LIVE_TEST_IMAGE")
                .expect("set HANAMI_LIVE_TEST_IMAGE to a local manga page"),
        );
        let output_dir = env::var_os("HANAMI_LIVE_TEST_OUTPUT")
            .map(PathBuf::from)
            .unwrap_or_else(|| env::temp_dir().join("hanami-live-api"));
        fs::create_dir_all(&output_dir).unwrap();

        let rect = NormalizedRect {
            x: 0.055,
            y: 0.03,
            width: 0.12,
            height: 0.13,
        };
        let artifacts = create_privacy_artifacts(
            &source_path,
            &[MaskRegion {
                id: "safe-dialogue".into(),
                kind: MaskKind::TextEdit,
                rect,
            }],
            &output_dir.join("request-artifacts"),
        )
        .unwrap();
        let model = env::var("HANAMI_LIVE_TEST_MODEL").unwrap_or_else(|_| "gpt-image-2".into());
        let size = image_output_size(&model, artifacts.image_width, artifacts.image_height);
        let client = OpenAiClient::new(
            load_saved_api_key(),
            &env::var("HANAMI_LIVE_TEST_API_BASE")
                .unwrap_or_else(|_| "https://api.openai.com/v1".into()),
        )
        .unwrap();
        let result = client
            .edit_image(ImageEditOptions {
                model: &model,
                quality: "medium",
                size: &size,
                image_path: &artifacts.image_path,
                mask_path: artifacts.mask_path.as_deref(),
                source_language: "Japanese",
                target_language: "Simplified Chinese",
                page_type: "manga",
                additional_instructions:
                    "Keep the short vertical dialogue centered inside its original speech bubble.",
                isolates_text_regions: true,
                protects_privacy_regions: false,
            })
            .await
            .unwrap();

        let encoded = result.split_once(',').unwrap().1;
        let generated_bytes = STANDARD.decode(encoded).unwrap();
        let raw_output_path = output_dir.join("generated-raw.png");
        fs::write(&raw_output_path, &generated_bytes).unwrap();

        let source = image::open(&source_path).unwrap().to_rgba8();
        let generated = image::load_from_memory(&generated_bytes)
            .unwrap()
            .to_rgba8();
        let composite = composite_region(&source, &generated, rect);
        let composite_path = output_dir.join("translated-composite.png");
        composite.save(&composite_path).unwrap();

        let (x0, y0, x1, y1) = rect_bounds(rect, source.width(), source.height());
        for y in 0..source.height() {
            for x in 0..source.width() {
                if x < x0 || x >= x1 || y < y0 || y >= y1 {
                    assert_eq!(composite.get_pixel(x, y), source.get_pixel(x, y));
                }
            }
        }
        assert_eq!(composite.dimensions(), source.dimensions());
        eprintln!("live output: {}", composite_path.display());
    }

    fn load_saved_api_key() -> String {
        let path = env::var_os("HANAMI_LIVE_TEST_KEY_FILE")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env::var_os("HOME").expect("HOME is unavailable")).join(
                    "Library/Application Support/app.hanami.translator/credentials/openai-api.key",
                )
            });
        fs::read_to_string(path)
            .expect("save an API key in the app before running the live test")
            .trim()
            .to_owned()
    }

    fn composite_region(
        source: &RgbaImage,
        generated: &RgbaImage,
        rect: NormalizedRect,
    ) -> RgbaImage {
        let mut composite = source.clone();
        let (sx0, sy0, sx1, sy1) = rect_bounds(rect, generated.width(), generated.height());
        let (dx0, dy0, dx1, dy1) = rect_bounds(rect, source.width(), source.height());
        let crop = imageops::crop_imm(generated, sx0, sy0, sx1 - sx0, sy1 - sy0).to_image();
        let scaled = imageops::resize(&crop, dx1 - dx0, dy1 - dy0, imageops::FilterType::Lanczos3);
        imageops::replace(&mut composite, &scaled, dx0.into(), dy0.into());
        composite
    }

    fn rect_bounds(rect: NormalizedRect, width: u32, height: u32) -> (u32, u32, u32, u32) {
        let rect = rect.clamped();
        let x0 = (rect.x * width as f32).floor() as u32;
        let y0 = (rect.y * height as f32).floor() as u32;
        let x1 = ((rect.x + rect.width) * width as f32).ceil() as u32;
        let y1 = ((rect.y + rect.height) * height as f32).ceil() as u32;
        (x0, y0, x1.min(width), y1.min(height))
    }
}
