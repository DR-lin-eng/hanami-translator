import type { PageItem } from "../types";
import { renderPageToPng } from "./exportImage";

const PDF_IMPORT_DPI = 160;
const IMAGE_EXPORT_DPI = 96;

type PageRenderer = (page: PageItem) => Promise<string>;

export function completedPagesInQueueOrder(pages: readonly PageItem[]): PageItem[] {
  // Array.filter is stable, so concurrency completion order cannot reorder pages.
  return pages.filter((page) => page.status === "completed");
}

export async function buildPdfBytes(
  pages: readonly PageItem[],
  renderPage: PageRenderer = renderPageToPng,
): Promise<Uint8Array> {
  if (!pages.length) throw new Error("没有可导出的已完成页面");

  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.create();
  document.setTitle("花见翻译");
  document.setCreator("花见翻译");
  document.setProducer("花见翻译");

  for (const page of pages) {
    const pngDataUrl = await renderPage(page);
    const png = await document.embedPng(await dataUrlBytes(pngDataUrl));
    const dpi = page.sourceKind === "pdfPage" ? PDF_IMPORT_DPI : IMAGE_EXPORT_DPI;
    const width = png.width * 72 / dpi;
    const height = png.height * 72 / dpi;
    const outputPage = document.addPage([width, height]);
    outputPage.drawImage(png, { x: 0, y: 0, width, height });
  }

  return document.save({ useObjectStreams: true });
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

async function dataUrlBytes(dataUrl: string): Promise<Uint8Array> {
  if (!dataUrl.startsWith("data:image/png")) {
    throw new Error("PDF 导出仅接受 PNG 页面数据");
  }
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}
