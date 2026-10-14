import type { AppSettings } from "../types";

const API_SETTINGS_KEY = "hanami.api-settings.v1";

export type PersistedApiSettings = Pick<AppSettings, "apiBase" | "apiMode" | "responsesModel" | "imageModel" | "quality">;

interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadApiSettings(storage: SettingsStorage = window.localStorage): Partial<PersistedApiSettings> {
  try {
    const value = storage.getItem(API_SETTINGS_KEY);
    if (!value) return {};
    return validateApiSettings(JSON.parse(value));
  } catch {
    return {};
  }
}

export function saveApiSettings(settings: PersistedApiSettings, storage: SettingsStorage = window.localStorage): void {
  try {
    storage.setItem(API_SETTINGS_KEY, JSON.stringify({
      apiBase: settings.apiBase.trim(),
      apiMode: settings.apiMode,
      responsesModel: settings.responsesModel.trim(),
      imageModel: settings.imageModel.trim(),
      quality: settings.quality,
    } satisfies PersistedApiSettings));
  } catch {
    // Storage can be unavailable in hardened WebViews; settings still work for this session.
  }
}

function validateApiSettings(value: unknown): Partial<PersistedApiSettings> {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const settings: Partial<PersistedApiSettings> = {};
  if (typeof candidate.apiBase === "string" && candidate.apiBase.trim() && candidate.apiBase.length <= 2048) {
    settings.apiBase = candidate.apiBase.trim();
  }
  if (typeof candidate.imageModel === "string" && candidate.imageModel.trim() && candidate.imageModel.length <= 128) {
    settings.imageModel = candidate.imageModel.trim();
  }
  if (candidate.apiMode === "images" || candidate.apiMode === "responses") {
    settings.apiMode = candidate.apiMode;
  }
  if (typeof candidate.responsesModel === "string" && candidate.responsesModel.trim() && candidate.responsesModel.length <= 128) {
    settings.responsesModel = candidate.responsesModel.trim();
  }
  if (["low", "medium", "high", "auto"].includes(String(candidate.quality))) {
    settings.quality = candidate.quality as PersistedApiSettings["quality"];
  }
  return settings;
}
