import type { PageItem } from "../types";
import { renderPageToPng } from "./exportImage";

const PDF_IMPORT_DPI = 160;
const IMAGE_EXPORT_DPI = 96;
const BASE64_DECODE_CHUNK_SIZE = 32 * 1024;

type PageRenderer = (page: PageItem) => Promise<string>;

export type PdfBuildPhase = "preparing" | "rendering" | "finalizing" | "completed";

export interface PdfBuildProgress {
  phase: PdfBuildPhase;
  current: number;
  total: number;
}

export type PdfBuildProgressListener = (progress: PdfBuildProgress) => void;

export function completedPagesInQueueOrder(pages: readonly PageItem[]): PageItem[] {
  // Array.filter is stable, so concurrency completion order cannot reorder pages.
  return pages.filter((page) => page.status === "completed");
}

export async function buildPdfBytes(
  pages: readonly PageItem[],
  renderPage: PageRenderer = renderPageToPng,
  onProgress?: PdfBuildProgressListener,
): Promise<Uint8Array> {
  if (!pages.length) throw new Error("没有可导出的已完成页面");

  onProgress?.({ phase: "preparing", current: 0, total: pages.length });

  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.create();
  document.setTitle("花见翻译");
  document.setCreator("花见翻译");
  document.setProducer("花见翻译");

  for (const [index, page] of pages.entries()) {
    onProgress?.({ phase: "rendering", current: index, total: pages.length });
    const pngDataUrl = await renderPage(page);
    const png = await document.embedPng(decodePngDataUrl(pngDataUrl));
    const dpi = page.sourceKind === "pdfPage" ? PDF_IMPORT_DPI : IMAGE_EXPORT_DPI;
    const width = png.width * 72 / dpi;
    const height = png.height * 72 / dpi;
    const outputPage = document.addPage([width, height]);
    outputPage.drawImage(png, { x: 0, y: 0, width, height });
    onProgress?.({ phase: "rendering", current: index + 1, total: pages.length });
  }

  onProgress?.({ phase: "finalizing", current: pages.length, total: pages.length });
  const bytes = await document.save({ useObjectStreams: true });
  onProgress?.({ phase: "completed", current: pages.length, total: pages.length });
  return bytes;
}

export function pdfBytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function decodePngDataUrl(dataUrl: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("PDF 导出仅接受 PNG 页面数据");
  }

  const base64 = dataUrl.slice(prefix.length);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const output = new Uint8Array(Math.floor(base64.length * 3 / 4) - padding);
  let outputOffset = 0;

  try {
    for (let offset = 0; offset < base64.length; offset += BASE64_DECODE_CHUNK_SIZE) {
      const decoded = atob(base64.slice(offset, offset + BASE64_DECODE_CHUNK_SIZE));
      for (let index = 0; index < decoded.length; index += 1) {
        output[outputOffset] = decoded.charCodeAt(index);
        outputOffset += 1;
      }
    }
  } catch {
    throw new Error("PDF 导出的 PNG 数据解码失败");
  }

  if (outputOffset !== output.length) {
    throw new Error("PDF 导出的 PNG 数据长度异常");
  }
  return output;
}
