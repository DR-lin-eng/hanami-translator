import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppSettings, ProcessPageRequest, ProcessPageResult, SourceAsset } from "../types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isNative = () => Boolean(window.__TAURI_INTERNALS__);

export async function chooseImages(): Promise<string[]> {
  const result = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
  });
  return normalizePaths(result);
}

export async function choosePdf(): Promise<string[]> {
  const result = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
  });
  return normalizePaths(result);
}

export async function chooseFolder(): Promise<string[]> {
  const result = await open({ multiple: false, directory: true });
  return normalizePaths(result);
}

export async function chooseOutputFile(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
}

export async function chooseOutputPdf(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
  });
}

export async function chooseOutputFolder(): Promise<string | null> {
  const result = await open({ multiple: false, directory: true });
  return typeof result === "string" ? result : null;
}

export const importNativePaths = (paths: string[]) =>
  invoke<SourceAsset[]>("import_paths", { paths });

export const loadNativeDemo = () => invoke<SourceAsset>("load_demo_asset");

export const startNativeProcessing = (jobId: string) =>
  invoke<void>("start_processing", { jobId });

export const processNativePage = (jobId: string, request: ProcessPageRequest) =>
  invoke<ProcessPageResult>("process_page", { jobId, request });

export const cancelNativeProcessing = (jobId: string) =>
  invoke<void>("cancel_processing", { jobId });

export const finishNativeProcessing = (jobId: string) =>
  invoke<void>("finish_processing", { jobId });

export const saveApiKey = (apiKey: string) => invoke<void>("save_api_key", { apiKey });

export const deleteApiKey = () => invoke<void>("delete_api_key");

export const apiKeyConfigured = () => invoke<boolean>("api_key_configured");

export const testApiConnection = (settings: Pick<AppSettings, "apiBase" | "apiMode" | "responsesModel" | "imageModel">) =>
  invoke<void>("test_api_connection", { settings });

export const writeOutput = (path: string, dataUrl: string) =>
  invoke<void>("write_output", { path, dataUrl });

function normalizePaths(value: string | string[] | null): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
