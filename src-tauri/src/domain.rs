use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAsset {
    pub id: String,
    pub name: String,
    pub source_kind: SourceKind,
    pub path: String,
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    pub page_number: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    Image,
    PdfPage,
    Demo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskRegion {
    pub id: String,
    pub kind: MaskKind,
    pub rect: NormalizedRect,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MaskKind {
    TextEdit,
    Privacy,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ApiMode {
    #[default]
    Images,
    Responses,
}

pub fn default_responses_model() -> String {
    "gpt-5".into()
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl NormalizedRect {
    pub fn clamped(self) -> Self {
        let x = self.x.clamp(0.0, 1.0);
        let y = self.y.clamp(0.0, 1.0);
        Self {
            x,
            y,
            width: self.width.clamp(0.0, 1.0 - x),
            height: self.height.clamp(0.0, 1.0 - y),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessPageRequest {
    pub path: String,
    pub source_language: String,
    pub target_language: String,
    pub page_type: String,
    pub additional_instructions: String,
    pub regions: Vec<MaskRegion>,
    pub api_base: String,
    #[serde(default)]
    pub api_mode: ApiMode,
    #[serde(default = "default_responses_model")]
    pub responses_model: String,
    pub image_model: String,
    pub quality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessPageResult {
    pub generated_image_data_url: String,
    pub note: String,
    pub privacy_restore_padding: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSettings {
    pub api_base: String,
    #[serde(default)]
    pub api_mode: ApiMode,
    #[serde(default = "default_responses_model")]
    pub responses_model: String,
    pub image_model: String,
}

#[cfg(test)]
mod tests {
    use super::{ApiMode, ApiSettings, NormalizedRect, ProcessPageRequest};

    #[test]
    fn legacy_requests_and_connection_settings_default_to_images() {
        let request: ProcessPageRequest = serde_json::from_value(serde_json::json!({
            "path": "page.png", "sourceLanguage": "English", "targetLanguage": "Chinese",
            "pageType": "document", "additionalInstructions": "", "regions": [],
            "apiBase": "https://api.openai.com/v1", "imageModel": "gpt-image-2", "quality": "medium",
        })).unwrap();
        assert_eq!(request.api_mode, ApiMode::Images);
        assert_eq!(request.responses_model, "gpt-5");
        let settings: ApiSettings = serde_json::from_value(serde_json::json!({
            "apiBase": "https://api.openai.com/v1", "imageModel": "gpt-image-2",
        }))
        .unwrap();
        assert_eq!(settings.api_mode, ApiMode::Images);
    }

    #[test]
    fn normalized_rect_is_clamped_to_canvas() {
        let rect = NormalizedRect {
            x: -0.2,
            y: 0.9,
            width: 1.5,
            height: 0.5,
        }
        .clamped();

        assert_eq!(rect.x, 0.0);
        assert_eq!(rect.y, 0.9);
        assert_eq!(rect.width, 1.0);
        assert!((rect.height - 0.1).abs() < f32::EPSILON * 8.0);
    }
}
