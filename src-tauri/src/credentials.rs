use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

const KEY_FILE: &str = "openai-api.key";
const MIGRATION_MARKER: &str = ".keychain-migration-complete";
#[cfg(target_os = "macos")]
const LEGACY_SERVICE: &str = "app.hanami.translator.openai";
#[cfg(target_os = "macos")]
const LEGACY_ACCOUNT: &str = "default";

pub fn save_api_key(app: &AppHandle, api_key: &str) -> AppResult<()> {
    let directory = credentials_directory(app)?;
    save_api_key_at(&directory, api_key)?;
    mark_migration_complete(&directory)?;
    delete_legacy_keychain();
    Ok(())
}

pub fn load_api_key(app: &AppHandle) -> AppResult<String> {
    let directory = credentials_directory(app)?;
    if directory.join(KEY_FILE).is_file() {
        return load_api_key_at(&directory);
    }

    if let Ok(value) = std::env::var("OPENAI_API_KEY") {
        return validate_api_key(&value);
    }

    if !directory.join(MIGRATION_MARKER).exists() {
        if let Some(api_key) = load_legacy_keychain() {
            save_api_key_at(&directory, &api_key)?;
            mark_migration_complete(&directory)?;
            delete_legacy_keychain();
            return Ok(api_key);
        }
        mark_migration_complete(&directory)?;
    }

    Err(AppError::Message("尚未在应用中保存 OpenAI API Key".into()))
}

pub fn has_api_key(app: &AppHandle) -> bool {
    load_api_key(app).is_ok()
}

pub fn delete_api_key(app: &AppHandle) -> AppResult<()> {
    let directory = credentials_directory(app)?;
    match fs::remove_file(directory.join(KEY_FILE)) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    mark_migration_complete(&directory)?;
    delete_legacy_keychain();
    Ok(())
}

fn credentials_directory(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(format!("无法定位应用数据目录：{error}")))?
        .join("credentials"))
}

fn save_api_key_at(directory: &Path, api_key: &str) -> AppResult<()> {
    let api_key = validate_api_key(api_key)?;
    ensure_private_directory(directory)?;
    write_private_file(&directory.join(KEY_FILE), api_key.as_bytes())
}

fn load_api_key_at(directory: &Path) -> AppResult<String> {
    let value = fs::read_to_string(directory.join(KEY_FILE))?;
    validate_api_key(&value)
        .map_err(|_| AppError::Message("应用中保存的 API Key 无效，请重新配置".into()))
}

fn validate_api_key(api_key: &str) -> AppResult<String> {
    let trimmed = api_key.trim();
    if trimmed.len() < 8 || trimmed.len() > 4096 || trimmed.chars().any(char::is_whitespace) {
        return Err(AppError::Message("API Key 格式不正确".into()));
    }
    Ok(trimmed.to_owned())
}

fn mark_migration_complete(directory: &Path) -> AppResult<()> {
    ensure_private_directory(directory)?;
    write_private_file(&directory.join(MIGRATION_MARKER), b"complete\n")
}

fn ensure_private_directory(directory: &Path) -> AppResult<()> {
    fs::create_dir_all(directory)?;
    #[cfg(unix)]
    fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

fn write_private_file(path: &Path, contents: &[u8]) -> AppResult<()> {
    let temporary = path.with_extension("tmp");
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(&temporary)?;
    file.write_all(contents)?;
    file.sync_all()?;
    #[cfg(unix)]
    fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))?;
    fs::rename(&temporary, path)?;
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn load_legacy_keychain() -> Option<String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            LEGACY_SERVICE,
            "-a",
            LEGACY_ACCOUNT,
            "-w",
        ])
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    validate_api_key(&String::from_utf8_lossy(&output.stdout)).ok()
}

#[cfg(not(target_os = "macos"))]
fn load_legacy_keychain() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn delete_legacy_keychain() {
    let _ = Command::new("security")
        .args([
            "delete-generic-password",
            "-s",
            LEGACY_SERVICE,
            "-a",
            LEGACY_ACCOUNT,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(target_os = "macos"))]
fn delete_legacy_keychain() {}

#[cfg(test)]
mod tests {
    use super::{load_api_key_at, save_api_key_at, KEY_FILE};

    #[test]
    fn saves_and_loads_the_api_key_from_the_app_directory() {
        let directory = tempfile::tempdir().unwrap();

        save_api_key_at(directory.path(), "sk-local-test-key-123456789").unwrap();

        assert_eq!(
            load_api_key_at(directory.path()).unwrap(),
            "sk-local-test-key-123456789"
        );
    }

    #[cfg(unix)]
    #[test]
    fn api_key_file_is_readable_only_by_the_current_user() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().unwrap();
        save_api_key_at(directory.path(), "sk-local-test-key-123456789").unwrap();

        let mode = std::fs::metadata(directory.path().join(KEY_FILE))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
        let directory_mode = std::fs::metadata(directory.path())
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(directory_mode & 0o777, 0o700);
    }

    #[test]
    fn rejects_invalid_keys_without_creating_a_file() {
        let directory = tempfile::tempdir().unwrap();

        assert!(save_api_key_at(directory.path(), "bad key").is_err());
        assert!(!directory.path().join(KEY_FILE).exists());
    }
}
