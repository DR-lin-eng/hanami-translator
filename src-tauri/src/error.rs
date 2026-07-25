use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("图片解析失败：{0}")]
    Image(#[from] image::ImageError),
    #[error("数据解析失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("网络请求失败：{0}")]
    Http(#[from] reqwest::Error),
    #[error("{0}")]
    Message(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}
