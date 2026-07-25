export type SourceKind = "image" | "pdfPage" | "demo";
export type PageStatus = "ready" | "processing" | "completed" | "error";
export type MaskKind = "textEdit" | "privacy";

export interface SourceAsset {
  id: string;
  name: string;
  sourceKind: SourceKind;
  path: string;
  dataUrl: string;
  width: number;
  height: number;
  pageNumber?: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskRegion {
  id: string;
  kind: MaskKind;
  rect: NormalizedRect;
}

export interface ProcessPageResult {
  generatedImageDataUrl: string;
  note: string;
  privacyRestorePadding: number;
}

export interface PageItem extends SourceAsset {
  status: PageStatus;
  result?: ProcessPageResult;
  error?: string;
  regions: MaskRegion[];
}

export interface AppSettings {
  sourceLanguage: string;
  targetLanguage: string;
  pageType: string;
  additionalInstructions: string;
  concurrency: number;
  apiBase: string;
  imageModel: string;
  quality: "low" | "medium" | "high" | "auto";
}

export interface ProcessPageRequest {
  path: string;
  sourceLanguage: string;
  targetLanguage: string;
  pageType: string;
  additionalInstructions: string;
  regions: MaskRegion[];
  apiBase: string;
  imageModel: string;
  quality: string;
}
